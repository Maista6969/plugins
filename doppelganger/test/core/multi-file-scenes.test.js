import test from "node:test";
import assert from "node:assert/strict";
import {
  groupSceneFileRows,
  selectFilesToDelete,
  planFileDeletion,
  planCopyDeletion,
} from "../../src/core/multi-file-scenes.js";

// (scene_id, title, file_id, primary, path, size, mod_time, width, height,
//  bit_rate, video_codec, duration, oshash)
const file = (sceneId, fileId, primary, f = {}) => [
  sceneId,
  "Title",
  fileId,
  primary,
  f.path ?? `/lib/${fileId}.mp4`,
  f.size ?? 100,
  f.modTime ?? "2026-01-01T00:00:00Z",
  f.width ?? 1920,
  f.height ?? 1080,
  f.bitRate ?? 4000000,
  f.codec ?? "hevc",
  f.duration ?? 60,
  f.oshash ?? `hash-${fileId}`,
];

const scene = (...rows) => groupSceneFileRows(rows)[0];

test("groups files by scene, primary first then by id, scenes by id", () => {
  const groups = groupSceneFileRows([
    file(30, 2, false),
    file(30, 1, true),
    file(4, 12, false),
    file(4, 8, false),
    file(4, 10, true),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.sceneId, g.files.map((f) => f.id)]),
    [
      ["4", ["10", "8", "12"]],
      ["30", ["1", "2"]],
    ],
  );
});

test("flags files sharing an oshash with another file in the scene", () => {
  const g = scene(
    file(1, 1, true, { oshash: "a" }),
    file(1, 2, false, { oshash: "a" }),
    file(1, 3, false, { oshash: "b" }),
  );
  assert.deepEqual(
    g.files.map((f) => f.identical),
    [true, true, false],
  );
});

test("a missing oshash never counts as identical", () => {
  const g = scene(
    file(1, 1, true, { oshash: "" }),
    file(1, 2, false, { oshash: "" }),
  );
  assert.deepEqual(
    g.files.map((f) => f.identical),
    [false, false],
  );
});

// Scene 4338: a 4K and a 1080p encode.
const resolutionPair = scene(
  file(4338, 3315, true, { width: 3840, height: 2160, bitRate: 2483816 }),
  file(4338, 13001, false, { width: 1920, height: 1080, bitRate: 2262073 }),
);

// Scene 4312: same resolution, different bit rates.
const bitratePair = scene(
  file(4312, 3289, true, { bitRate: 4355741, size: 1431732263 }),
  file(4312, 10534, false, { bitRate: 2241370, size: 735355333 }),
);

// Scene 16611: the 1080p encode is the non-primary file.
const promotedPair = scene(
  file(16611, 16180, true, { width: 1280, height: 720, codec: "av1" }),
  file(16611, 16554, false, { width: 1920, height: 1080, codec: "av1" }),
);

test("largest resolution keeps the biggest frame", () => {
  assert.deepEqual(selectFilesToDelete(resolutionPair, "largest_resolution"), [
    "13001",
  ]);
  assert.deepEqual(selectFilesToDelete(promotedPair, "largest_resolution"), [
    "16180",
  ]);
});

test("largest resolution selects nothing when every file matches", () => {
  assert.deepEqual(selectFilesToDelete(bitratePair, "largest_resolution"), []);
});

test("highest bit rate keeps the highest bit rate", () => {
  assert.deepEqual(selectFilesToDelete(bitratePair, "highest_bitrate"), [
    "10534",
  ]);
});

test("largest file keeps the biggest file, primary on a tie", () => {
  assert.deepEqual(selectFilesToDelete(bitratePair, "largest_file"), ["10534"]);
  const tie = scene(file(1, 1, true), file(1, 2, false));
  assert.deepEqual(selectFilesToDelete(tie, "largest_file"), ["2"]);
});

test("oldest and youngest compare modification times", () => {
  const g = scene(
    file(1, 1, true, { modTime: "2024-05-01T00:00:00Z" }),
    file(1, 2, false, { modTime: "2021-05-01T00:00:00Z" }),
    file(1, 3, false, { modTime: "2025-05-01T00:00:00Z" }),
  );
  assert.deepEqual(selectFilesToDelete(g, "oldest"), ["1", "3"]);
  assert.deepEqual(selectFilesToDelete(g, "youngest"), ["1", "2"]);
});

test("preferred codec deletes every other codec, and nothing without it", () => {
  const g = scene(
    file(1, 1, true, { codec: "h264" }),
    file(1, 2, false, { codec: "av1" }),
    file(1, 3, false, { codec: "av1" }),
  );
  assert.deepEqual(
    selectFilesToDelete(g, "preferred_codec", { preferredCodec: "av1" }),
    ["1"],
  );
  assert.deepEqual(
    selectFilesToDelete(g, "preferred_codec", { preferredCodec: "hevc" }),
    [],
  );
});

test("mixed codecs select nothing unless the guard is off", () => {
  const g = scene(
    file(1, 1, true, { codec: "h264", width: 1280, height: 720 }),
    file(1, 2, false, { codec: "av1" }),
  );
  assert.deepEqual(selectFilesToDelete(g, "largest_resolution"), []);
  assert.deepEqual(
    selectFilesToDelete(g, "largest_resolution", { onlyMatchingCodecs: false }),
    ["1"],
  );
});

test("byte-identical copies keep the primary under any rule but none", () => {
  const g = scene(
    file(1, 1, true, { oshash: "a" }),
    file(1, 2, false, { oshash: "a" }),
  );
  for (const option of [
    "largest_resolution",
    "highest_bitrate",
    "largest_file",
    "oldest",
  ]) {
    assert.deepEqual(selectFilesToDelete(g, option), ["2"], option);
  }
  assert.deepEqual(selectFilesToDelete(g, "none"), []);
});

test("deleting the primary promotes the first file left", () => {
  const plan = planFileDeletion(promotedPair, ["16180"]);
  assert.equal(plan.setPrimaryFileId, "16554");
  assert.deepEqual(plan.deleteFileIds, ["16180"]);
});

test("keeping the primary needs no promotion", () => {
  const g = scene(
    file(1, 5, true, { size: 300 }),
    file(1, 6, false, { size: 300 }),
    file(1, 7, false, { size: 300 }),
  );
  const plan = planFileDeletion(g, ["6", "7"]);
  assert.equal(plan.setPrimaryFileId, null);
  assert.deepEqual(plan.deleteFileIds, ["6", "7"]);
  assert.equal(plan.bytes, 600);
});

test("refuses to delete every file of a scene", () => {
  assert.throws(() => planFileDeletion(bitratePair, ["3289", "10534"]));
});

test("planCopyDeletion keeps one file and rejects unknown keepers", () => {
  const plan = planCopyDeletion(bitratePair, "10534");
  assert.equal(plan.setPrimaryFileId, "10534");
  assert.deepEqual(plan.deleteFileIds, ["3289"]);
  assert.throws(() => planCopyDeletion(bitratePair, "99"));
});
