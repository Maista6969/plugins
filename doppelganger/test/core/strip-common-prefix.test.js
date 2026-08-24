import test from "node:test";
import assert from "node:assert/strict";
import { stripCommonPrefix } from "../../src/core/strip-common-prefix.js";

test("drops the shared leading directories", () => {
  assert.deepEqual(
    stripCommonPrefix([
      "/library/Nebula Films/Sunflower Fields.mp4",
      "/library/Sunflower Fields.mp4",
    ]),
    ["Nebula Films/Sunflower Fields.mp4", "Sunflower Fields.mp4"],
  );
});

test("leaves only basenames when every file shares a folder", () => {
  assert.deepEqual(
    stripCommonPrefix(["/a/b/one.mp4", "/a/b/two.mp4", "/a/b/three.mp4"]),
    ["one.mp4", "two.mp4", "three.mp4"],
  );
});

test("only trims whole segments, never part of a name", () => {
  assert.deepEqual(stripCommonPrefix(["/a/foo-1.mp4", "/a/foo-2.mp4"]), [
    "foo-1.mp4",
    "foo-2.mp4",
  ]);
});

test("keeps paths intact when they share no leading directory", () => {
  const paths = ["/one/a.mp4", "/two/b.mp4"];
  assert.deepEqual(stripCommonPrefix(paths), paths);
});

test("never strips a path down to nothing", () => {
  assert.deepEqual(stripCommonPrefix(["/a/b/same.mp4", "/a/b/same.mp4"]), [
    "same.mp4",
    "same.mp4",
  ]);
});

test("a single path is left alone, having nothing to share a prefix with", () => {
  assert.deepEqual(stripCommonPrefix(["/a/b/only.mp4"]), ["/a/b/only.mp4"]);
});

test("handles a path that is entirely a prefix of the others", () => {
  assert.deepEqual(
    stripCommonPrefix(["/a/b.mp4", "/a/b/c.mp4", "/a/b/d/e.mp4"]),
    ["b.mp4", "b/c.mp4", "b/d/e.mp4"],
  );
});

test("returns an empty list unchanged", () => {
  assert.deepEqual(stripCommonPrefix([]), []);
});
