import { gqlGetPluginConfig, gqlConfigurePluginAs } from "./gql.js";
import { describePatternPair } from "../core/path-template.js";
import { adapterFor } from "../core/entity-adapter.js";
import {
  RESULTS_PLUGIN_ID,
  applyOutcomes,
  recordRun,
} from "../core/run-results.js";

// the same fallback the preview uses, so a failure reads like its preview row
export function displayName(scene, entityType) {
  if (scene.title) {
    return scene.title;
  }
  const file = adapterFor(entityType).files(scene)[0];
  return file && file.path ? file.path.replace(/^.*[\\/]/, "") : "";
}

// What a rename that neither renamed nor found its target in place came to,
// or null when it did one of those or was skipped
export function outcomeError(outcome, scene, entityType) {
  const title = displayName(scene, entityType);
  if (outcome.status === "error") {
    const messages = outcome.missingData
      .map((m) => {
        return m.message;
      })
      .join(", ");
    return {
      sceneId: outcome.sceneId,
      title,
      error:
        'pattern "' +
        describePatternPair(outcome.folderPattern, outcome.filenamePattern) +
        '" cannot be satisfied: ' +
        messages,
      missingData: outcome.missingData,
    };
  }
  const moveErrors = outcome.moveErrors || [];
  if (moveErrors.length === 0) {
    return null;
  }
  const collided = moveErrors.find((e) => {
    return e.collision;
  });
  return {
    sceneId: outcome.sceneId,
    title,
    error:
      "moveFiles failed: " +
      moveErrors
        .map((e) => {
          return "file " + e.fileId + ": " + e.error;
        })
        .join("; "),
    collision: collided ? collided.collision : null,
  };
}

// Never lets bookkeeping fail the rename it is about
export function recordOutcomes(entityType, errors, resolvedIds, run) {
  try {
    const stored = gqlGetPluginConfig(RESULTS_PLUGIN_ID);
    const applied = applyOutcomes(
      stored,
      entityType,
      errors,
      resolvedIds,
      new Date().toISOString(),
    );
    if (!applied.changed && !run) {
      return;
    }
    gqlConfigurePluginAs(
      RESULTS_PLUGIN_ID,
      run ? recordRun(applied.store, run) : applied.store,
    );
  } catch (e) {
    if (typeof log !== "undefined" && log.Warn) {
      log.Warn("librarian: could not record what renaming came to: " + e);
    }
  }
}
