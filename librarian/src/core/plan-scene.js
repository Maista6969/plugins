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
  describePatternPair,
} from "./path-template.js";
import { assignSuffixes } from "./file-ordering.js";
import { deriveFileTech } from "./file-tech.js";

function getExtension(basename) {
  const dotIndex = (basename || "").lastIndexOf(".");
  return dotIndex === -1 ? "" : basename.slice(dotIndex);
}

function splitPath(path) {
  const p = path || "";
  const idx = p.lastIndexOf("/");
  return idx === -1
    ? { folder: "", basename: p }
    : { folder: p.slice(0, idx), basename: p.slice(idx + 1) };
}

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
export function planScene(rawScene, config) {
  const sceneView = normalizeScene(rawScene);

  if (config.onlyOrganized && !sceneView.organized) {
    return {
      status: "skipped",
      reason: "not_organized",
      sceneId: sceneView.id,
      files: [],
    };
  }

  if (config.onlyWithStashId && !sceneView.hasStashId) {
    return {
      status: "skipped",
      reason: "no_stash_id",
      sceneId: sceneView.id,
      files: [],
    };
  }

  const excludeConditions = config.excludeConditions;
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
          return describeCondition(sceneView, c);
        }),
        files: [],
      };
    }
  }

  if (sceneView.files.length === 0) {
    return {
      status: "skipped",
      reason: "no_files",
      sceneId: sceneView.id,
      files: [],
    };
  }

  const matchedRule = matchRule(sceneView, config.rules || []);
  const folderPattern = matchedRule
    ? matchedRule.folderPattern
    : (config.defaultPattern && config.defaultPattern.folderPattern) || "";
  const filenamePattern = matchedRule
    ? matchedRule.filenamePattern
    : (config.defaultPattern && config.defaultPattern.filenamePattern) || "";
  const sortBy =
    (matchedRule && matchedRule.sortBy) ||
    (config.defaultPattern && config.defaultPattern.sortBy) ||
    "alphabetical";
  const renderConfig = Object.assign({}, config, { sortBy: sortBy });

  const libraryRoot = matchedRule
    ? matchedRule.libraryRoot
    : config.defaultPattern && config.defaultPattern.libraryRoot;
  if (!libraryRoot) {
    return dataError(
      "no_library_root",
      sceneView.id,
      matchedRule,
      folderPattern,
      filenamePattern,
      [
        {
          token: null,
          message: matchedRule
            ? "the matched rule has no library root configured"
            : "the default pattern has no library root configured",
        },
      ],
    );
  }

  const stashBoxEndpoint =
    (matchedRule && matchedRule.stashBoxEndpoint) ||
    (config.defaultPattern && config.defaultPattern.stashBoxEndpoint) ||
    "";
  const matchedIds = {
    performerIds: getMatchedEntityIds(sceneView, matchedRule, "performer"),
    tagIds: getMatchedEntityIds(sceneView, matchedRule, "tag"),
    stashBoxEndpoint: stashBoxEndpoint,
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

    const rendered = renderPath(
      folderPattern,
      filenamePattern,
      fileView,
      renderConfig,
      matchedIds,
    );

    if (!rendered.basenameHasContent) {
      return dataError(
        "empty_filename",
        sceneView.id,
        matchedRule,
        folderPattern,
        filenamePattern,
        [
          {
            token: null,
            message:
              "the pattern produced no real filename for this scene (every token is either optional or has no data). Refusing to rename to a generic placeholder, since other scenes/files could collide on the same name",
          },
        ],
      );
    }

    if (!rendered.basenameHasMetadataContent) {
      return dataError(
        "no_identifying_metadata",
        sceneView.id,
        matchedRule,
        folderPattern,
        filenamePattern,
        [
          {
            token: null,
            message:
              "the filename would be based entirely on file properties (resolution/codec/bitrate/fps) with no actual Stash metadata (title, studio, performers, tags, date, or rating). Refusing to rename to a name that can't be told apart from other uncatalogued files with the same technical specs; add metadata to this scene, or use a pattern whose filename includes at least one metadata field",
          },
        ],
      );
    }

    perFile.push({
      file: file,
      folder: joinPath(libraryRoot, rendered.folder),
      basenameNoExt: rendered.basenameNoExt,
    });
  }

  const groups = {};
  const groupKeys = [];
  perFile.forEach((entry) => {
    // NUL byte will never appear in filenames and is a safe joiner here
    const key = entry.folder + "\0" + entry.basenameNoExt;
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
      const current = splitPath(file.path);
      const extension = getExtension(current.basename);
      const basename = s.basenameNoExt + extension;
      const currentFolder = normalizePathForCompare(current.folder);
      const unchanged =
        currentFolder === normalizePathForCompare(entry.folder) &&
        current.basename === basename;
      resultByFileId[file.id] = {
        fileId: file.id,
        folder: entry.folder,
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

  return {
    status: "ok",
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
