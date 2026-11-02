// Rows come from the multi-file query in stash-api.ts, one per file, in the
// fixed order (scene_id, title, file_id, primary, path, size, mod_time, width,
// height, bit_rate, video_codec, duration, oshash).
export function groupSceneFileRows(rows) {
  const groups = new Map();

  for (const row of rows) {
    const [
      sceneId,
      title,
      fileId,
      primary,
      path,
      size,
      modTime,
      width,
      height,
      bitRate,
      codec,
      duration,
      oshash,
    ] = row;
    const key = String(sceneId);

    if (!groups.has(key)) {
      groups.set(key, { sceneId: key, title: title || "", files: [] });
    }
    groups.get(key).files.push({
      id: String(fileId),
      primary: Boolean(primary),
      path: path || "",
      size: Number(size) || 0,
      modTime: modTime || "",
      width: Number(width) || 0,
      height: Number(height) || 0,
      bitRate: Number(bitRate) || 0,
      codec: codec || "",
      duration: Number(duration) || 0,
      oshash: oshash || null,
      identical: false,
    });
  }

  const result = Array.from(groups.values());
  for (const group of result) {
    // Primary first, then oldest file id: that is the order Stash itself
    // shows a scene's files in, and every rule below breaks ties by keeping
    // the earliest file, so ties fall back to the primary.
    group.files.sort(
      (a, b) =>
        Number(b.primary) - Number(a.primary) || Number(a.id) - Number(b.id),
    );
    for (const file of group.files) {
      file.identical =
        !!file.oshash &&
        group.files.some((f) => f !== file && f.oshash === file.oshash);
    }
  }
  result.sort((a, b) => Number(a.sceneId) - Number(b.sceneId));
  return result;
}

export const SELECT_OPTIONS = [
  "none",
  "largest_resolution",
  "largest_file",
  "highest_bitrate",
  "preferred_codec",
  "oldest",
  "youngest",
];

// The first file with the highest score; later files only win outright.
function best(files, score) {
  return files.reduce((a, b) => (score(b) > score(a) ? b : a));
}

function allSame(files, value) {
  return new Set(files.map(value)).size === 1;
}

function allBut(files, keeper) {
  return files.filter((f) => f !== keeper).map((f) => f.id);
}

// Mirrors the "Select Options" of Stash's scene duplicate checker
// (components/SceneDuplicateChecker/SceneDuplicateChecker.tsx), applied to a
// scene's files instead of a group of scenes: the returned ids are the files
// to delete. Stash's quirks are kept so its rules select what users expect --
// resolution skips groups where every file matches, the preferred codec keeps
// every file in that codec and ignores the matching-codecs guard, and age
// compares modification times.
export function selectFilesToDelete(group, option, opts = {}) {
  const { preferredCodec = "", onlyMatchingCodecs = true } = opts;
  const { files } = group;
  if (option === "none" || files.length < 2) return [];

  // Byte-identical copies make every rule a tie, and some rules select
  // nothing on a tie; any copy is as good as another, so keep the primary.
  if (files.every((f) => f.identical && f.oshash === files[0].oshash)) {
    return allBut(files, files[0]);
  }

  if (option === "preferred_codec") {
    if (!files.some((f) => f.codec === preferredCodec)) return [];
    return files.filter((f) => f.codec !== preferredCodec).map((f) => f.id);
  }

  if (onlyMatchingCodecs && !allSame(files, (f) => f.codec)) return [];

  switch (option) {
    case "largest_resolution": {
      const pixels = (f) => f.width * f.height;
      if (allSame(files, pixels)) return [];
      return allBut(files, best(files, pixels));
    }
    case "highest_bitrate": {
      const rate = (f) => f.bitRate;
      if (allSame(files, rate)) return [];
      return allBut(files, best(files, rate));
    }
    case "largest_file":
      return allBut(
        files,
        best(files, (f) => f.size),
      );
    case "oldest":
      return allBut(
        files,
        best(files, (f) => -new Date(f.modTime).getTime()),
      );
    case "youngest":
      return allBut(
        files,
        best(files, (f) => new Date(f.modTime).getTime()),
      );
    default:
      return [];
  }
}

// Stash refuses to delete a scene's primary file, so when the primary is
// among the files going away, the first file staying is promoted first.
// Returned as data rather than executed so the sequence can be tested and
// previewed.
export function planFileDeletion(group, deleteIds) {
  const doomed = group.files.filter((f) => deleteIds.includes(f.id));
  const kept = group.files.filter((f) => !deleteIds.includes(f.id));
  if (kept.length === 0) {
    throw new Error(`scene ${group.sceneId} would be left without a file`);
  }

  return {
    sceneId: group.sceneId,
    setPrimaryFileId: doomed.some((f) => f.primary) ? kept[0].id : null,
    deleteFileIds: doomed.map((f) => f.id),
    bytes: doomed.reduce((sum, f) => sum + f.size, 0),
  };
}

export function planCopyDeletion(group, keeperId) {
  if (!group.files.some((f) => f.id === keeperId)) {
    throw new Error(`file ${keeperId} is not in scene ${group.sceneId}`);
  }
  return planFileDeletion(
    group,
    group.files.filter((f) => f.id !== keeperId).map((f) => f.id),
  );
}
