import { planEntity, isOtherRulesWork } from "../core/plan-scene.js";
import { adapterFor } from "../core/entity-adapter.js";
import { gqlMoveFile, gqlFindOwnerOfPath } from "./gql.js";
import { filesNeedingMove } from "./hook-guard.js";
import { joinBasename } from "../core/path-template.js";

const ALREADY_EXISTS = /file (.+?) already exists/;

// Returns the message to log, plus what clashed so the UI can say it in the
// viewer's language and link to the owner
function explainMoveError(entityType, error) {
  const match = ALREADY_EXISTS.exec(error);
  if (!match) {
    return { message: error, collision: null };
  }
  const path = match[1];

  let owner = null;
  try {
    owner = gqlFindOwnerOfPath(entityType, path);
  } catch (e) {
    // the explanation is a nicety: never let it turn into a second failure
  }

  const noun = adapterFor(entityType).noun;
  if (!owner) {
    return {
      message:
        "cannot be renamed to " +
        path +
        ": a file is already there. Nothing was overwritten",
      collision: { path: path, ownerId: null, ownerTitle: "" },
    };
  }
  return {
    message:
      "cannot be renamed to " +
      path +
      ", which already belongs to " +
      noun +
      " " +
      owner.id +
      (owner.title ? ' "' + owner.title + '"' : "") +
      ". They may be duplicates of each other. Nothing was overwritten",
    collision: {
      path: path,
      ownerId: String(owner.id),
      ownerTitle: owner.title || "",
    },
  };
}

function logRename(level, noun, entityId, file) {
  if (typeof log === "undefined" || level === "off") {
    return;
  }
  const line =
    noun +
    " " +
    entityId +
    ": " +
    file.currentPath +
    " -> " +
    joinBasename(file.folder, file.basename);
  if (level === "info") {
    log.Info(line);
  } else {
    log.Debug(line);
  }
}

// With a ruleId only that rule's work is done, and null comes back for an
// entity that belongs to another rule or the default pattern
export function renameEntity(
  rawEntity,
  config,
  entityType,
  stashBoxes,
  ruleId,
) {
  const plan = planEntity(rawEntity, config, entityType, stashBoxes);
  if (ruleId && isOtherRulesWork(plan, ruleId)) {
    return null;
  }

  if (plan.status !== "ok") {
    return plan;
  }

  const toMove = filesNeedingMove(plan);
  const moveErrors = [];
  toMove.forEach((file) => {
    try {
      const ok = gqlMoveFile(
        file.fileId,
        file.folder,
        file.basename,
        file.folderId,
      );
      if (ok) {
        logRename(
          config && config.logLevel,
          adapterFor(entityType).noun,
          plan.sceneId,
          file,
        );
      } else {
        moveErrors.push({
          fileId: file.fileId,
          error: "moveFiles returned false",
        });
      }
    } catch (e) {
      const explained = explainMoveError(entityType, String(e));
      moveErrors.push({
        fileId: file.fileId,
        error: explained.message,
        collision: explained.collision,
      });
    }
  });

  return Object.assign({}, plan, {
    moved: toMove.length - moveErrors.length,
    moveErrors: moveErrors,
  });
}

export function renameScene(rawScene, config, stashBoxes) {
  return renameEntity(rawScene, config, "scenes", stashBoxes);
}
