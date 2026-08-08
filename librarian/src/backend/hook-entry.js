import {
  gqlFindScene,
  gqlGetConfig,
  gqlGetLibraryPaths,
  gqlConfigurePlugin,
} from "./gql.js";
import { normalizeConfig } from "../core/config-schema.js";
import { pruneDeadLibraryRootsAll } from "../core/prune-dead-library-roots.js";
import { describePatternPair, joinBasename } from "../core/path-template.js";
import { renameScene } from "./core-runner.js";

function logInfo(message) {
  if (typeof log !== "undefined" && log.Info) {
    log.Info(message);
  }
}

function logError(message) {
  if (typeof log !== "undefined" && log.Error) {
    log.Error(message);
  }
}

export function run(args) {
  try {
    const hookContext = args.hookContext;
    if (!hookContext || !hookContext.id) {
      return {
        Error: "librarian: hook invoked without a scene id in hookContext",
      };
    }

    const rawConfig = gqlGetConfig();
    let config = normalizeConfig(rawConfig);
    if (!config.scenes.autoRename) {
      return { Output: "skipped: automatic renaming is disabled" };
    }
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

    const scene = gqlFindScene(hookContext.id);
    if (!scene) {
      return { Output: "skipped: scene " + hookContext.id + " not found" };
    }

    const outcome = renameScene(scene, config);
    if (outcome.status === "error") {
      const messages = outcome.missingData
        .map((m) => {
          return m.message;
        })
        .join(", ");
      const text =
        "librarian: scene " +
        outcome.sceneId +
        ' matched pattern "' +
        describePatternPair(outcome.folderPattern, outcome.filenamePattern) +
        '" but cannot satisfy it: ' +
        messages;
      logInfo(text);
      return { Output: text };
    }
    if (outcome.status === "skipped") {
      const detail =
        outcome.reason === "excluded" &&
        outcome.excludedBy &&
        outcome.excludedBy.length > 0
          ? outcome.reason + ": " + outcome.excludedBy.join(", ")
          : outcome.reason;
      return {
        Output: "skipped: scene " + outcome.sceneId + " (" + detail + ")",
      };
    }

    const moveErrors = outcome.moveErrors || [];
    if (moveErrors.length > 0) {
      const message = moveErrors
        .map((e) => {
          return "file " + e.fileId + ": " + e.error;
        })
        .join("; ");
      const text =
        "librarian: scene " + outcome.sceneId + " moveFiles failed: " + message;
      logError(text);
      return { Output: text };
    }
    const changedPaths = outcome.files
      .filter((f) => {
        return !f.unchanged;
      })
      .map((f) => {
        return joinBasename(f.folder, f.basename);
      });
    return {
      Output:
        "scene " +
        outcome.sceneId +
        (changedPaths.length > 0
          ? " renamed to: " + changedPaths.join(", ")
          : " already at target"),
    };
  } catch (e) {
    return { Error: "librarian hook error: " + String(e) };
  }
}
