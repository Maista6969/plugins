import { planEntity } from "../core/plan-scene.js";
import { gqlMoveFile } from "./gql.js";
import { filesNeedingMove } from "./hook-guard.js";

export function renameEntity(rawEntity, config, entityType) {
  const plan = planEntity(rawEntity, config, entityType);

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
      moveErrors.push({ fileId: file.fileId, error: String(e) });
    }
  });

  return Object.assign({}, plan, {
    moved: toMove.length - moveErrors.length,
    moveErrors: moveErrors,
  });
}

export function renameScene(rawScene, config) {
  return renameEntity(rawScene, config, "scenes");
}
