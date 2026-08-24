// Rows come from the identical-copies query in stash-api.ts, one per file, in
// the fixed order (scene_id, title, oshash, file_id, primary, path, size,
// mod_time). A scene can in principle hold two unrelated clusters of copies,
// so the group key is scene + hash rather than scene alone.
export function groupIdenticalCopyRows(rows) {
  const groups = new Map();

  for (const row of rows) {
    const [sceneId, title, oshash, fileId, primary, path, size, modTime] = row;
    const key = String(sceneId) + "\0" + oshash;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        sceneId: String(sceneId),
        title: title || "",
        oshash,
        files: [],
      });
    }
    groups.get(key).files.push({
      id: String(fileId),
      primary: Boolean(primary),
      path: path || "",
      size: Number(size) || 0,
      modTime: modTime || "",
    });
  }

  const result = Array.from(groups.values());
  for (const group of result) {
    // Primary first, then oldest file id: that is the order Stash itself
    // shows a scene's files in, and it puts the default keeper on top.
    group.files.sort(
      (a, b) =>
        Number(b.primary) - Number(a.primary) || Number(a.id) - Number(b.id),
    );
  }
  result.sort((a, b) => Number(a.sceneId) - Number(b.sceneId));
  return result;
}

// Stash's own choice of primary file is the default keeper. When the primary
// is not part of this cluster (the scene's primary is some other file
// entirely), the first copy stands in.
export function defaultKeeperId(group) {
  return group.files[0]?.id;
}

// Stash refuses to delete a scene's primary file, so when the file being kept
// is not the primary and the primary is one of the copies going away, the
// keeper has to be promoted first. Returned as data rather than executed so
// the sequence can be tested and previewed.
export function planCopyDeletion(group, keeperId) {
  const keeper = group.files.find((f) => f.id === keeperId);
  if (!keeper) {
    throw new Error(`file ${keeperId} is not in scene ${group.sceneId}`);
  }

  const doomed = group.files.filter((f) => f.id !== keeperId);
  const promoteKeeper = doomed.some((f) => f.primary);

  return {
    sceneId: group.sceneId,
    setPrimaryFileId: promoteKeeper ? keeper.id : null,
    deleteFileIds: doomed.map((f) => f.id),
    bytes: doomed.reduce((sum, f) => sum + f.size, 0),
  };
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unit]}`;
}
