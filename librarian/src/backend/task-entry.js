import {
  gqlFindScenes,
  gqlFindScene,
  gqlGetConfig,
  gqlGetLibraryPaths,
  gqlConfigurePlugin,
  gqlCountScenes,
  gqlFindDeadEntityIds,
} from "./gql.js";
import { normalizeConfig } from "../core/config-schema.js";
import { pruneDeadLibraryRoots } from "../core/prune-dead-library-roots.js";
import {
  collectEntityIds,
  pruneDeadEntities,
} from "../core/prune-dead-entities.js";
import { ruleToPreviewFilter } from "../core/rule-to-filter.js";
import { describePatternPair } from "../core/path-template.js";
import { renameScene } from "./core-runner.js";

const PAGE_SIZE = 1000;

function logProgress(fraction) {
  if (typeof log !== "undefined" && log.Progress) {
    log.Progress(fraction);
  }
}

function logError(sceneId, message) {
  if (typeof log !== "undefined" && log.Error) {
    log.Error("scene " + (sceneId == null ? "?" : sceneId) + ": " + message);
  }
}

function processScene(scene, config, summary) {
  summary.processed++;
  let outcome;
  try {
    outcome = renameScene(scene, config);
  } catch (e) {
    summary.errors.push({ sceneId: scene.id, error: String(e) });
    logError(scene.id, String(e));
    return;
  }
  if (outcome.status === "skipped") {
    summary.skipped++;
  } else if (outcome.status === "error") {
    const messages = outcome.missingData
      .map((m) => {
        return m.message;
      })
      .join(", ");
    const message =
      'pattern "' +
      describePatternPair(outcome.folderPattern, outcome.filenamePattern) +
      '" cannot be satisfied: ' +
      messages;
    summary.errors.push({ sceneId: outcome.sceneId, error: message });
    logError(outcome.sceneId, message);
  } else {
    const moveErrors = outcome.moveErrors || [];
    const moved = outcome.moved || 0;
    if (moveErrors.length > 0) {
      const message = moveErrors
        .map((e) => {
          return "file " + e.fileId + ": " + e.error;
        })
        .join("; ");
      summary.errors.push({
        sceneId: outcome.sceneId,
        error: "moveFiles failed: " + message,
      });
      logError(outcome.sceneId, "moveFiles failed: " + message);
    }
    if (moved > 0) {
      summary.changed++;
    } else if (moveErrors.length === 0) {
      summary.unchanged++;
    }
  }
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
  const rawConfig = gqlGetConfig();
  let config = normalizeConfig(rawConfig);

  try {
    const validPaths = gqlGetLibraryPaths();
    const pruned = pruneDeadLibraryRoots(config, validPaths);
    if (pruned.config !== config) {
      config = pruned.config;
      gqlConfigurePlugin(config);
    }
  } catch (e) {
    // silently skipped
  }

  try {
    const suspiciousRules = [];
    (config.rules || []).forEach((rule) => {
      if (
        rule.enabled === false ||
        !rule.conditions ||
        rule.conditions.length === 0
      ) {
        return;
      }
      const filter = ruleToPreviewFilter(rule, config);
      if (filter !== null && gqlCountScenes(filter) === 0) {
        suspiciousRules.push(rule);
      }
    });
    if (suspiciousRules.length > 0) {
      const referencedIds = collectEntityIds({ rules: suspiciousRules });
      const deadIds = gqlFindDeadEntityIds(referencedIds);
      const prunedEntities = pruneDeadEntities(config, deadIds);
      if (prunedEntities.config !== config) {
        config = prunedEntities.config;
        gqlConfigurePlugin(config);
      }
    }
  } catch (e) {
    // silently skipped
  }

  const summary = {
    processed: 0,
    changed: 0,
    unchanged: 0,
    skipped: 0,
    errors: [],
  };

  if (Array.isArray(args.sceneIds) && args.sceneIds.length > 0) {
    args.sceneIds.forEach((id) => {
      let scene;
      try {
        scene = gqlFindScene(id);
      } catch (e) {
        summary.errors.push({ sceneId: id, error: String(e) });
        logError(id, String(e));
        return;
      }
      if (!scene) {
        summary.errors.push({ sceneId: id, error: "scene not found" });
        logError(id, "scene not found");
        return;
      }
      processScene(scene, config, summary);
    });
    const text = summaryText(
      "librarian: processed " +
        summary.processed +
        " explicitly requested scene(s)",
      summary,
    );
    return { Output: text };
  }

  const sceneFilter = args.scene_filter || null;
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
      result = gqlFindScenes(sceneFilter, findFilter);
    } catch (e) {
      const message =
        "failed to fetch page " + page + " of scenes: " + String(e);
      summary.errors.push({ sceneId: null, error: message });
      logError(null, message);
      break;
    }
    total = result.count;
    const scenes = result.scenes;
    if (scenes.length === 0) {
      break;
    }

    scenes.forEach((scene) => {
      processScene(scene, config, summary);
    });

    logProgress(total > 0 ? Math.min(1, summary.processed / total) : 1);
    page++;
  }

  const text = summaryText(
    "librarian: processed " + summary.processed,
    summary,
  );
  return { Output: text };
}
