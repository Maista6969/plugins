import { planEntity } from "../core/plan-scene.js";
import { adapterFor } from "../core/entity-adapter.js";
import { gqlMoveFile, gqlFindOwnerOfPath } from "./gql.js";
import { filesNeedingMove } from "./hook-guard.js";

const ALREADY_EXISTS = /file (.+?) already exists/;

function explainMoveError(entityType, error) {
  const match = ALREADY_EXISTS.exec(error);
  if (!match) {
    return error;
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
    return (
      "cannot be renamed to " +
      path +
      ": a file is already there. Nothing was overwritten"
    );
  }
  return (
    "cannot be renamed to " +
    path +
    ", which already belongs to " +
    noun +
    " " +
    owner.id +
    (owner.title ? ' "' + owner.title + '"' : "") +
    ". They may be duplicates of each other. Nothing was overwritten"
  );
}

export function renameEntity(rawEntity, config, entityType, stashBoxes) {
  const plan = planEntity(rawEntity, config, entityType, stashBoxes);

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
      if (!ok) {
        moveErrors.push({
          fileId: file.fileId,
          error: "moveFiles returned false",
        });
      }
    } catch (e) {
      moveErrors.push({
        fileId: file.fileId,
        error: explainMoveError(entityType, String(e)),
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
