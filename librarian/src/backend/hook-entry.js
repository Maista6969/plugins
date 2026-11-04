import {
  gqlFindEntity,
  gqlGetConfig,
  gqlGetLibraryPaths,
  gqlGetStashBoxes,
  gqlConfigurePlugin,
} from "./gql.js";
import { normalizeConfig } from "../core/config-schema.js";
import { configNeedsStashBoxes } from "../core/plan-scene.js";
import { pruneDeadLibraryRootsAll } from "../core/prune-dead-library-roots.js";
import { describePatternPair } from "../core/path-template.js";
import { renameEntity } from "./core-runner.js";
import { outcomeError, recordOutcomes } from "./outcomes.js";
import { adapterFor } from "../core/entity-adapter.js";

// Stash sends the trigger name, so one hook entry point serves all three types
const ENTITY_TYPE_BY_TRIGGER = {
  "Scene.Update.Post": "scenes",
  "Gallery.Update.Post": "galleries",
  "Image.Update.Post": "images",
};

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
        Error: "librarian: hook invoked without an entity id in hookContext",
      };
    }

    const entityType =
      ENTITY_TYPE_BY_TRIGGER[hookContext.Type || hookContext.type] ||
      args.entity ||
      "scenes";
    const noun = adapterFor(entityType).noun;

    const rawConfig = gqlGetConfig();
    let config = normalizeConfig(rawConfig);
    if (!config[entityType].autoRename) {
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

    const scene = gqlFindEntity(entityType, hookContext.id);
    if (!scene) {
      return {
        Output: "skipped: " + noun + " " + hookContext.id + " not found",
      };
    }

    // Only run when the pattern requires it so it stays cheap for most users
    let stashBoxes = null;
    if (configNeedsStashBoxes(config, entityType)) {
      try {
        stashBoxes = gqlGetStashBoxes();
      } catch (e) {
        // silently skipped
      }
    }

    const outcome = renameEntity(scene, config, entityType, stashBoxes);
    const error = outcomeError(outcome, scene, entityType);
    recordOutcomes(
      entityType,
      error ? [error] : [],
      error ? [] : [String(outcome.sceneId)],
      null,
    );
    if (outcome.status === "error") {
      const messages = outcome.missingData
        .map((m) => {
          return m.message;
        })
        .join(", ");
      const text =
        "librarian: " +
        noun +
        " " +
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
        outcome.message ||
        (outcome.reason === "excluded" &&
        outcome.excludedBy &&
        outcome.excludedBy.length > 0
          ? outcome.reason + ": " + outcome.excludedBy.join(", ")
          : outcome.reason);
      return {
        Output:
          "skipped: " + noun + " " + outcome.sceneId + " (" + detail + ")",
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
        "librarian: " +
        noun +
        " " +
        outcome.sceneId +
        " moveFiles failed: " +
        message;
      logError(text);
      return { Output: text };
    }
    // the paths themselves go to the log at the level the user picked, so
    // this only says what happened: Stash logs it at Debug whatever we return
    const moved = outcome.moved || 0;
    return {
      Output:
        noun +
        " " +
        outcome.sceneId +
        (moved > 0
          ? " renamed (" + moved + (moved === 1 ? " file)" : " files)")
          : " already at target"),
    };
  } catch (e) {
    return { Error: "librarian hook error: " + String(e) };
  }
}
