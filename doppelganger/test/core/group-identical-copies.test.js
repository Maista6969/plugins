import test from "node:test";
import assert from "node:assert/strict";
import {
  groupIdenticalCopyRows,
  defaultKeeperId,
  planCopyDeletion,
} from "../../src/core/group-identical-copies.js";

// (scene_id, title, oshash, file_id, primary, path, size, mod_time)
const row = (sceneId, oshash, fileId, primary, path, size = 100) => [
  sceneId,
  "Title",
  oshash,
  fileId,
  primary,
  path,
  size,
  "2026-01-01T00:00:00Z",
];

test("groups files by scene and hash, primary first then by id", () => {
  const groups = groupIdenticalCopyRows([
    row(9, "aaa", 12, false, "/lib/b.mp4"),
    row(9, "aaa", 8, false, "/lib/a.mp4"),
    row(9, "aaa", 10, true, "/lib/primary.mp4"),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].sceneId, "9");
  assert.deepEqual(
    groups[0].files.map((f) => f.id),
    ["10", "8", "12"],
  );
  assert.equal(defaultKeeperId(groups[0]), "10");
});

test("a scene with two unrelated clusters yields two groups", () => {
  const groups = groupIdenticalCopyRows([
    row(4, "aaa", 1, true, "/a1"),
    row(4, "aaa", 2, false, "/a2"),
    row(4, "bbb", 3, false, "/b1"),
    row(4, "bbb", 4, false, "/b2"),
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((g) => g.oshash),
    ["aaa", "bbb"],
  );
});

test("groups are ordered by scene id numerically", () => {
  const groups = groupIdenticalCopyRows([
    row(30, "c", 1, true, "/x"),
    row(30, "c", 2, false, "/y"),
    row(4, "a", 3, true, "/x"),
    row(4, "a", 4, false, "/y"),
  ]);
  assert.deepEqual(
    groups.map((g) => g.sceneId),
    ["4", "30"],
  );
});

test("keeping the primary needs no promotion", () => {
  const [group] = groupIdenticalCopyRows([
    row(1, "h", 5, true, "/keep", 300),
    row(1, "h", 6, false, "/copy1", 300),
    row(1, "h", 7, false, "/copy2", 300),
  ]);

  const plan = planCopyDeletion(group, "5");

  assert.equal(plan.setPrimaryFileId, null);
  assert.deepEqual(plan.deleteFileIds, ["6", "7"]);
  assert.equal(plan.bytes, 600);
});

test("keeping a copy promotes it when the primary is being deleted", () => {
  const [group] = groupIdenticalCopyRows([
    row(1, "h", 5, true, "/primary"),
    row(1, "h", 6, false, "/keep"),
  ]);

  const plan = planCopyDeletion(group, "6");

  assert.equal(plan.setPrimaryFileId, "6");
  assert.deepEqual(plan.deleteFileIds, ["5"]);
});

test("no promotion when the scene's primary is outside the cluster", () => {
  const [group] = groupIdenticalCopyRows([
    row(1, "h", 6, false, "/copy1"),
    row(1, "h", 7, false, "/copy2"),
  ]);

  const plan = planCopyDeletion(group, "7");

  assert.equal(plan.setPrimaryFileId, null);
  assert.deepEqual(plan.deleteFileIds, ["6"]);
});

test("rejects a keeper that is not in the group", () => {
  const [group] = groupIdenticalCopyRows([
    row(1, "h", 6, true, "/a"),
    row(1, "h", 7, false, "/b"),
  ]);
  assert.throws(() => planCopyDeletion(group, "99"));
});
