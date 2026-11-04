import { joinBasename, normalizePathForCompare } from "./path-template.js";

export function clashKey(sceneId, fileId) {
  return String(sceneId) + ":" + String(fileId);
}

// Only what is planned side by side can be compared without asking Stash
// about every target path, so a clash with a file outside `rows` goes unseen
// here and surfaces when the move itself is refused.
// Returns clashKey -> [{ scene, alreadyThere }] for each file that would move
// onto a path another row's file is moving to (alreadyThere false) or is
// already at (alreadyThere true). A file staying put is never the one warned
export function findPathClashes(rows) {
  const byTarget = new Map();
  (rows || []).forEach(({ scene, plan }) => {
    if (!plan || plan.status !== "ok") {
      return;
    }
    (plan.files || []).forEach((f) => {
      const target = f.unchanged
        ? f.currentPath
        : joinBasename(f.folder, f.basename);
      const key = normalizePathForCompare(target);
      if (!byTarget.has(key)) {
        byTarget.set(key, []);
      }
      byTarget.get(key).push({ scene, file: f });
    });
  });

  const clashes = new Map();
  byTarget.forEach((entries) => {
    if (entries.length < 2) {
      return;
    }
    entries.forEach((entry) => {
      if (entry.file.unchanged) {
        return;
      }
      const others = entries
        .filter((other) => {
          return other.file.fileId !== entry.file.fileId;
        })
        .map((other) => {
          return { scene: other.scene, alreadyThere: !!other.file.unchanged };
        });
      if (others.length > 0) {
        clashes.set(clashKey(entry.scene.id, entry.file.fileId), others);
      }
    });
  });
  return clashes;
}
