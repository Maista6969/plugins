import {
  gqlFindEntities,
  gqlFindEntity,
  gqlGetConfig,
  gqlGetLibraryPaths,
  gqlGetStashBoxes,
  gqlConfigurePlugin,
  gqlCountEntities,
  gqlFindDeadEntityIds,
} from "./gql.js";
import { runFromSummary } from "../core/run-results.js";
import { displayName, outcomeError, recordOutcomes } from "./outcomes.js";
import { normalizeConfig } from "../core/config-schema.js";
import { configNeedsStashBoxes } from "../core/plan-scene.js";
import { pruneDeadLibraryRootsAll } from "../core/prune-dead-library-roots.js";
import {
  collectEntityIds,
  pruneDeadEntitiesAll,
} from "../core/prune-dead-entities.js";
import { ruleToPreviewFilter } from "../core/rule-to-filter.js";
import { renameEntity } from "./core-runner.js";
import { adapterFor } from "../core/entity-adapter.js";

const PAGE_SIZE = 1000;

function logProgress(fraction) {
  if (typeof log !== "undefined" && log.Progress) {
    log.Progress(fraction);
  }
}

function logError(noun, sceneId, message) {
  if (typeof log !== "undefined" && log.Error) {
    log.Error(noun + " " + (sceneId == null ? "?" : sceneId) + ": " + message);
  }
}

function processScene(scene, config, summary, entityType, stashBoxes, ruleId) {
  const noun = adapterFor(entityType).noun;
  let outcome;
  try {
    outcome = renameEntity(scene, config, entityType, stashBoxes, ruleId);
  } catch (e) {
    summary.processed++;
    summary.errors.push({
      sceneId: scene.id,
      title: displayName(scene, entityType),
      error: String(e),
    });
    logError(noun, scene.id, String(e));
    return;
  }
  if (!outcome) {
    return;
  }
  summary.processed++;
  const error = outcomeError(outcome, scene, entityType);
  if (error) {
    summary.errors.push(error);
    logError(noun, outcome.sceneId, error.error);
  } else {
    summary.resolvedIds.push(String(outcome.sceneId));
  }
  if (outcome.status === "skipped") {
    summary.skipped++;
  } else if (outcome.status === "ok") {
    const moved = outcome.moved || 0;
    if (moved > 0) {
      summary.changed++;
    } else if (!error) {
      summary.unchanged++;
    }
  }
}

// A run_id is only passed by runs started from Librarian's UI, which wait to
// read their run back; every run updates what is still open
function recordResult(args, entityType, summary) {
  recordOutcomes(
    entityType,
    summary.errors,
    summary.resolvedIds,
    args.run_id ? runFromSummary(args.run_id, entityType, summary) : null,
  );
}

function summaryText(intro, summary) {
  return (
    intro +
    ", changed " +
    summary.changed +
    ", unchanged " +
    summary.unchanged +
    ", skipped " +
    summary.skipped +
    ", errors " +
    summary.errors.length
  );
}

export function run(args) {
  if (args.mode === "dummy") {
    return { Output: "Pressing that button did nothing" };
  }
  try {
    return runSweep(args);
  } catch (e) {
    return { Error: "librarian: " + String(e) };
  }
}

function runSweep(args) {
  const entityType = args.entity || "scenes";
  const adapter = adapterFor(entityType);
  const rawConfig = gqlGetConfig();
  let config = normalizeConfig(rawConfig);

  try {
    const validPaths = gqlGetLibraryPaths();
    const pruned = pruneDeadLibraryRootsAll(config, validPaths);
    if (pruned.config !== config) {
      config = pruned.config;
      gqlConfigurePlugin(config);
    }
  } catch (e) {
    // silently skipped
  }

  try {
    const suspiciousRules = [];
    (config[entityType].rules || []).forEach((rule) => {
      if (
        rule.enabled === false ||
        !rule.conditions ||
        rule.conditions.length === 0
      ) {
        return;
      }
      const filter = ruleToPreviewFilter(rule, config[entityType]);
      if (filter !== null && gqlCountEntities(entityType, filter) === 0) {
        suspiciousRules.push(rule);
      }
    });
    if (suspiciousRules.length > 0) {
      const referencedIds = collectEntityIds({ rules: suspiciousRules });
      const deadIds = gqlFindDeadEntityIds(referencedIds);
      const prunedEntities = pruneDeadEntitiesAll(config, deadIds);
      if (prunedEntities.config !== config) {
        config = prunedEntities.config;
        gqlConfigurePlugin(config);
      }
    }
  } catch (e) {
    // silently skipped
  }

  // After the prune blocks above, which can disable rules and so change whether
  // any pattern still resolves a stash-box. Once per sweep, never per entity
  let stashBoxes = null;
  if (configNeedsStashBoxes(config, entityType)) {
    try {
      stashBoxes = gqlGetStashBoxes();
    } catch (e) {
      // silently skipped
    }
  }

  const summary = {
    processed: 0,
    changed: 0,
    unchanged: 0,
    skipped: 0,
    errors: [],
    resolvedIds: [],
  };

  if (Array.isArray(args.sceneIds) && args.sceneIds.length > 0) {
    args.sceneIds.forEach((id) => {
      let scene;
      try {
        scene = gqlFindEntity(entityType, id);
      } catch (e) {
        summary.errors.push({ sceneId: id, error: String(e) });
        logError(adapter.noun, id, String(e));
        return;
      }
      if (!scene) {
        summary.errors.push({
          sceneId: id,
          error: adapter.noun + " not found",
          gone: true,
        });
        logError(adapter.noun, id, adapter.noun + " not found");
        return;
      }
      processScene(scene, config, summary, entityType, stashBoxes);
    });
    const text = summaryText(
      "librarian: processed " +
        summary.processed +
        " explicitly requested " +
        adapter.noun +
        "(s)",
      summary,
    );
    recordResult(args, entityType, summary);
    return { Output: text };
  }

  const sceneFilter = args.scene_filter || args.entity_filter || null;
  const searchQuery = (args.filter && args.filter.q) || null;

  let page = 1;
  let total = null;

  while (total === null || (page - 1) * PAGE_SIZE < total) {
    const findFilter = {
      page: page,
      per_page: PAGE_SIZE,
      sort: "id",
      direction: "ASC",
    };
    if (searchQuery) {
      findFilter.q = searchQuery;
    }

    let result;
    try {
      result = gqlFindEntities(entityType, sceneFilter, findFilter);
    } catch (e) {
      const message =
        "failed to fetch page " +
        page +
        " of " +
        adapter.plural +
        ": " +
        String(e);
      summary.errors.push({ sceneId: null, error: message });
      logError(adapter.noun, null, message);
      break;
    }
    total = result.count;
    const scenes = result.items;
    if (scenes.length === 0) {
      break;
    }

    scenes.forEach((scene) => {
      processScene(
        scene,
        config,
        summary,
        entityType,
        stashBoxes,
        args.rule_id || null,
      );
    });

    const seen = (page - 1) * PAGE_SIZE + scenes.length;
    logProgress(total > 0 ? Math.min(1, seen / total) : 1);
    page++;
  }

  const text = summaryText(
    "librarian: processed " + summary.processed,
    summary,
  );
  recordResult(args, entityType, summary);
  return { Output: text };
}
