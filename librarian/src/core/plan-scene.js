import { normalizeScene } from "./normalize-scene.js";
import {
  matchRule,
  getMatchedEntityIds,
  matchingConditions,
  describeCondition,
} from "./rule-engine.js";
import {
  renderPath,
  joinPath,
  normalizePathForCompare,
  findMissingRequiredData,
  findPatternProblems,
  patternsNeedStashIdDefault,
  patternsUseStashIdSource,
  patternUsesAnyToken,
  findDisambiguationRisks,
  resolveSceneGroup,
  describePatternPair,
  folderPatternMode,
  filenamePatternMode,
  currentUsage,
} from "./path-template.js";
import { assignSuffixes } from "./file-ordering.js";
import { deriveFileTech } from "./file-tech.js";
import { hasStashIdFrom, stashIdEndpoints } from "./stash-id-condition.js";
import { adapterFor } from "./entity-adapter.js";
// Only these apply to every type; everything else belongs to a section. Sharing
// the list stops a stray top-level key, such as one left behind by an older
// config shape, leaking a scene-only gate into galleries or images.
import { GLOBAL_SETTING_KEYS } from "./config-schema.js";

function getExtension(basename) {
  const dotIndex = (basename || "").lastIndexOf(".");
  return dotIndex === -1 ? "" : basename.slice(dotIndex);
}

function stripExtension(basename) {
  const name = basename || "";
  return name.slice(0, name.length - getExtension(name).length);
}

function splitPath(path) {
  const p = path || "";
  // Stash reports native paths, so a Windows library yields backslashes only:
  // splitting on "/" alone left the whole path as the basename
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx === -1
    ? { folder: "", basename: p }
    : { folder: p.slice(0, idx), basename: p.slice(idx + 1) };
}

// A rule's Stash filter can over-select, and rules are tried in order with the
// default pattern taking the rest, so some entities it selects are another
// rule's or the default's. A plan decided before any rule was tried, like an
// unorganized skip, carries no matchedRule and belongs to none of them
export function isOtherRulesWork(plan, ruleId) {
  return plan.matchedRule !== undefined && plan.matchedRule !== ruleId;
}

// An empty endpoint list means any source will do
function dataError(
  reason,
  sceneId,
  matchedRule,
  folderPattern,
  filenamePattern,
  missingData,
) {
  return {
    status: "error",
    reason: reason,
    sceneId: sceneId,
    matchedRule: matchedRule ? matchedRule.id || null : null,
    folderPattern: folderPattern,
    filenamePattern: filenamePattern,
    missingData: missingData,
    files: [],
  };
}

// Used in both the frontend and in the Goja backend so it needs to
// stay compatible with the limited JS environment the VM provides
export function planScene(rawScene, config, stashBoxes) {
  return planEntity(rawScene, config, "scenes", stashBoxes);
}

export function storedStashBoxEndpoint(settings, matchedRule) {
  return (
    (matchedRule && matchedRule.stashBoxEndpoint) ||
    (settings.defaultPattern && settings.defaultPattern.stashBoxEndpoint) ||
    ""
  );
}

export function entitySettings(config, entityType) {
  const cfg = config || {};
  const globals = {};
  GLOBAL_SETTING_KEYS.forEach((key) => {
    if (cfg[key] !== undefined) {
      globals[key] = cfg[key];
    }
  });
  return Object.assign(globals, cfg[entityType] || {});
}

export function configNeedsStashBoxes(config, entityType) {
  const adapter = adapterFor(entityType);
  if (adapter.tokens.indexOf("stash_id") === -1) {
    return false;
  }
  const settings = entitySettings(config, entityType);

  // only to name the sources when an exclusion is reported, endpoints match
  // without them
  const exclusions = (settings.excludeConditions || {}).conditions || [];
  if (
    exclusions.some((c) => {
      return (
        c && c.field === "stash_id" && stashIdEndpoints(c.value).length > 0
      );
    })
  ) {
    return true;
  }

  const candidates = [{ pattern: settings.defaultPattern, rule: null }];
  (settings.rules || []).forEach((rule) => {
    if (rule && rule.enabled !== false) {
      candidates.push({ pattern: rule, rule: rule });
    }
  });

  return candidates.some((candidate) => {
    if (!candidate.pattern) {
      return false;
    }
    const patterns = [
      candidate.pattern.folderPattern,
      candidate.pattern.filenamePattern,
    ];
    if (patternsUseStashIdSource(patterns)) {
      return true;
    }
    return (
      patternsNeedStashIdDefault(patterns) &&
      !storedStashBoxEndpoint(settings, candidate.rule)
    );
  });
}

export function planEntity(rawScene, config, entityType, stashBoxes) {
  const settings = entitySettings(config, entityType);
  const adapter = adapterFor(entityType);
  const sceneView = normalizeScene(rawScene, entityType);

  if (settings.onlyOrganized && !sceneView.organized) {
    return {
      status: "skipped",
      reason: "not_organized",
      sceneId: sceneView.id,
      files: [],
    };
  }

  if (
    settings.onlyWithStashId &&
    !hasStashIdFrom(sceneView, settings.stashIdEndpoints)
  ) {
    return {
      status: "skipped",
      reason: "no_stash_id",
      sceneId: sceneView.id,
      files: [],
    };
  }

  const excludeConditions = settings.excludeConditions;
  if (excludeConditions) {
    const matched = matchingConditions(
      sceneView,
      excludeConditions.conditionLogic,
      excludeConditions.conditions,
    );
    if (matched.length > 0) {
      return {
        status: "skipped",
        reason: "excluded",
        sceneId: sceneView.id,
        excludedBy: matched.map((c) => {
          return describeCondition(sceneView, c, stashBoxes);
        }),
        files: [],
      };
    }
  }

  // Structural limits (folder galleries, images inside a zip) are reported before
  // the generic no_files skip, which would otherwise hide the real reason
  const ineligible = adapter.ineligible(rawScene);
  if (ineligible) {
    return {
      status: "skipped",
      reason: ineligible.reason,
      message: ineligible.message,
      sceneId: sceneView.id,
      files: [],
    };
  }

  if (sceneView.files.length === 0) {
    return {
      status: "skipped",
      reason: "no_files",
      sceneId: sceneView.id,
      files: [],
    };
  }

  const matchedRule = matchRule(sceneView, settings.rules || []);
  const folderPattern = matchedRule
    ? matchedRule.folderPattern
    : (settings.defaultPattern && settings.defaultPattern.folderPattern) || "";
  const filenamePattern = matchedRule
    ? matchedRule.filenamePattern
    : (settings.defaultPattern && settings.defaultPattern.filenamePattern) ||
      "";
  const sortBy =
    (matchedRule && matchedRule.sortBy) ||
    (settings.defaultPattern && settings.defaultPattern.sortBy) ||
    "alphabetical";
  const renderConfig = Object.assign({}, settings, { sortBy: sortBy });

  const patternOptions = { stashBoxes: stashBoxes || null };
  const patternProblems = []
    .concat(findPatternProblems(folderPattern, adapter.tokens, patternOptions))
    .concat(
      findPatternProblems(filenamePattern, adapter.tokens, patternOptions),
    )
    .filter((problem) => {
      return problem.blocking;
    });
  if (patternProblems.length > 0) {
    return dataError(
      "invalid_pattern",
      sceneView.id,
      matchedRule,
      folderPattern,
      filenamePattern,
      patternProblems.map((problem) => {
        // the problem itself rides along so the UI can translate it
        return {
          token: null,
          message: problem.raw + ": " + problem.message,
          problem: problem,
        };
      }),
    );
  }

  const folderMode = folderPatternMode(folderPattern);
  const filenameMode = filenamePatternMode(filenamePattern);

  // A backstop rather than something a user is expected to see: the editor
  // substitutes {current} the moment a field is cleared, and normalizeConfig
  // rewrites any blank it is handed, on every path into the planner. This is
  // what keeps a blank from meaning something by accident if one ever gets past
  // both of those
  if (folderMode === "blank" || filenameMode === "blank") {
    return dataError(
      "blank_pattern",
      sceneView.id,
      matchedRule,
      folderPattern,
      filenamePattern,
      [
        {
          token: null,
          code:
            folderMode === "blank"
              ? "blank_folder_pattern"
              : "blank_filename_pattern",
          values: {},
          message:
            "a blank pattern does nothing. Use {current} to keep the " +
            (folderMode === "blank" ? "folder" : "name"),
        },
      ],
    );
  }

  // The one skip decided after rule matching, so it is the one that can say
  // which rule made it. Without that, a keep-everything rule looks like the
  // default pattern doing nothing
  if (folderMode === "keep" && filenameMode === "keep") {
    return {
      status: "skipped",
      reason: "nothing_to_change",
      message: "both patterns are {current}",
      sceneId: sceneView.id,
      matchedRule: matchedRule ? matchedRule.id || null : null,
      files: [],
    };
  }

  const libraryRoot = matchedRule
    ? matchedRule.libraryRoot
    : settings.defaultPattern && settings.defaultPattern.libraryRoot;

  // keep-in-place never leaves the file's own folder, so it needs no root
  if (folderMode !== "keep" && !libraryRoot) {
    return dataError(
      "no_library_root",
      sceneView.id,
      matchedRule,
      folderPattern,
      filenamePattern,
      [
        {
          token: null,
          code: matchedRule
            ? "rule_no_library_root"
            : "default_no_library_root",
          values: {},
          message: matchedRule
            ? "the matched rule has no library root configured"
            : "the default pattern has no library root configured",
        },
      ],
    );
  }

  const matchedIds = {
    performerIds: getMatchedEntityIds(sceneView, matchedRule, "performer"),
    tagIds: getMatchedEntityIds(sceneView, matchedRule, "tag"),
    stashBoxEndpoint: storedStashBoxEndpoint(settings, matchedRule),
    stashBoxes: stashBoxes || null,
  };

  // We trust Stash's ordering of files: primary file will be first
  const sortedFiles = sceneView.files;

  const perFile = [];
  for (let i = 0; i < sortedFiles.length; i++) {
    const file = sortedFiles[i];
    const fileView = Object.assign({}, sceneView, deriveFileTech(file));

    const missingData = findMissingRequiredData(
      [folderPattern, filenamePattern],
      fileView,
      matchedIds,
      adapter.noun,
    );
    if (missingData.length > 0) {
      return dataError(
        "missing_data",
        sceneView.id,
        matchedRule,
        folderPattern,
        filenamePattern,
        missingData,
      );
    }

    const current = splitPath(file.path);

    const rendered = renderPath(
      folderPattern,
      filenamePattern,
      fileView,
      renderConfig,
      matchedIds,
      { folder: current.folder, basename: stripExtension(current.basename) },
    );

    // Both guards ask whether the pattern produced a usable name. Neither means
    // anything when the file is keeping the name it already has
    if (filenameMode === "render" && !rendered.basenameHasContent) {
      return dataError(
        "empty_filename",
        sceneView.id,
        matchedRule,
        folderPattern,
        filenamePattern,
        [
          {
            token: null,
            code: "empty_filename",
            values: {},
            message:
              "the filename came out empty: every token is optional or has no data",
          },
        ],
      );
    }

    if (filenameMode === "render" && !rendered.basenameHasMetadataContent) {
      return dataError(
        "no_identifying_metadata",
        sceneView.id,
        matchedRule,
        folderPattern,
        filenamePattern,
        [
          {
            token: null,
            code: "no_identifying_metadata",
            values: {},
            message:
              "the filename only has file properties like resolution or codec, which other files can share. Add a metadata token such as {title}",
          },
        ],
      );
    }

    // Deliberately not run through sanitizeSegment: the name is already on disk,
    // so it is legal there, and sanitizing would rename the very file the blank
    // pattern promised to leave alone (spaceReplacement being the obvious way)
    const basenameNoExt =
      filenameMode === "keep"
        ? stripExtension(current.basename)
        : rendered.basenameNoExt;

    // {current} is the one token that reads what the pattern writes, so a
    // pattern using it can fail to settle: {current|regex=/a/aa/} grows every
    // run, {current|titlecase|compact} costs one extra rename before it stops.
    // Rendering once more from the name we just produced is a total check, and
    // needs no claim about whether the modifiers are idempotent
    if (currentUsage(filenamePattern).modified) {
      const again = renderPath(
        folderPattern,
        filenamePattern,
        fileView,
        renderConfig,
        matchedIds,
        { folder: current.folder, basename: basenameNoExt },
      );
      if (again.basenameNoExt !== basenameNoExt) {
        return dataError(
          "unstable_pattern",
          sceneView.id,
          matchedRule,
          folderPattern,
          filenamePattern,
          [
            {
              token: null,
              code: "unstable_pattern",
              values: { first: basenameNoExt, second: again.basenameNoExt },
              message:
                "renaming to " +
                basenameNoExt +
                " would rename again to " +
                again.basenameNoExt +
                " next time: modifiers on {current} must leave a renamed" +
                " file alone",
            },
          ],
        );
      }
    }

    if (folderMode === "render" && !rendered.folder) {
      return dataError(
        "empty_folder",
        sceneView.id,
        matchedRule,
        folderPattern,
        filenamePattern,
        [
          {
            token: null,
            code: "empty_folder",
            values: {},
            message:
              "the folder came out empty. Use {current} to keep the folder, or / for the library root",
          },
        ],
      );
    }

    const targetFolder =
      folderMode === "keep"
        ? current.folder
        : joinPath(libraryRoot, rendered.folder);

    // Some entities may be renamed but not relocated. Only worth checking once
    // the target is known, since staying put is always allowed.
    if (
      adapter.relocationBlocked &&
      normalizePathForCompare(targetFolder) !==
        normalizePathForCompare(current.folder)
    ) {
      const blocked = adapter.relocationBlocked(rawScene);
      if (blocked) {
        return {
          status: "skipped",
          reason: blocked.reason,
          message: blocked.message,
          matchedRule: matchedRule ? matchedRule.id || null : null,
          sceneId: sceneView.id,
          files: [],
        };
      }
    }

    perFile.push({
      file: file,
      current: current,
      // Move by folder id when keeping files put: it is authoritative, cannot
      // create a folder hierarchy, and avoids re-parsing the path
      folderId:
        folderMode === "keep" && file.parent_folder
          ? file.parent_folder.id
          : null,
      folder: targetFolder,
      basenameNoExt: basenameNoExt,
      // Kept names only really collide when the whole name matches, extension
      // included, and suffixing one that does not would be the rename a blank
      // pattern promises never to make. A rendered name is shared by every file
      // of the entity, so there the extension must stay out of the key
      groupExtension:
        filenameMode === "keep" ? getExtension(current.basename) : "",
    });
  }

  const groups = {};
  const groupKeys = [];
  perFile.forEach((entry) => {
    // NUL byte will never appear in filenames and is a safe joiner here
    const key =
      entry.folder + "\0" + entry.basenameNoExt + "\0" + entry.groupExtension;
    if (!groups[key]) {
      groups[key] = [];
      groupKeys.push(key);
    }
    groups[key].push(entry);
  });

  const resultByFileId = {};
  groupKeys.forEach((key) => {
    const group = groups[key];
    const suffixed = assignSuffixes(
      group.map((entry) => {
        return entry.file;
      }),
      group[0].basenameNoExt,
    );
    suffixed.forEach((s, i) => {
      const entry = group[i];
      const file = entry.file;
      const current = entry.current;
      const extension = getExtension(current.basename);
      const basename = s.basenameNoExt + extension;
      const currentFolder = normalizePathForCompare(current.folder);
      const unchanged =
        currentFolder === normalizePathForCompare(entry.folder) &&
        current.basename === basename;
      resultByFileId[file.id] = {
        fileId: file.id,
        folder: entry.folder,
        folderId: entry.folderId,
        basename: basename,
        currentBasename: current.basename,
        currentPath: file.path,
        unchanged: unchanged,
      };
    });
  });

  const files = sortedFiles.map((file) => {
    return resultByFileId[file.id];
  });

  // Which group {group} spoke for is a choice the user did not make, so a
  // scene in several says so on its own row rather than only in the docs. Not
  // an error: the pick is deterministic, it just might not be the one wanted
  const groupChoice = resolveSceneGroup(sceneView);
  const warnings = [];
  if (
    groupChoice.ambiguous &&
    patternUsesAnyToken(folderPattern + " " + filenamePattern, [
      "group",
      "group_idx",
      "group_not_in_title",
    ])
  ) {
    warnings.push({
      code: "several_groups",
      values: {
        count: groupChoice.all.length,
        chosen: groupChoice.group.name,
        others: groupChoice.all
          .slice(1)
          .map((g) => g.name)
          .join(", "),
      },
      message:
        "in " +
        groupChoice.all.length +
        ' groups; using "' +
        groupChoice.group.name +
        '", the oldest. Others: ' +
        groupChoice.all
          .slice(1)
          .map((g) => g.name)
          .join(", "),
    });
  }

  const disambiguationRisks = findDisambiguationRisks(
    [folderPattern, filenamePattern],
    sceneView,
    renderConfig,
    matchedIds,
  );
  if (disambiguationRisks.length > 0) {
    const names = disambiguationRisks
      .map((risk) => {
        return risk.name + " (" + risk.disambiguation + ")";
      })
      .join(", ");
    warnings.push({
      code: "needs_disambiguate",
      values: { names, count: disambiguationRisks.length },
      message:
        names +
        " may need |disambiguate: this pattern renders the " +
        (disambiguationRisks.length === 1 ? "name" : "names") +
        " alone",
    });
  }

  return {
    status: "ok",
    warnings: warnings,
    matchedRule: matchedRule ? matchedRule.id || null : null,
    reason: matchedRule
      ? "rule:" +
        (matchedRule.id ||
          describePatternPair(
            matchedRule.folderPattern,
            matchedRule.filenamePattern,
          ))
      : "default",
    sceneId: sceneView.id,
    files: files,
  };
}
