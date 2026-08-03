import test from "node:test";
import assert from "node:assert/strict";
import { assignSuffixes } from "../../src/core/file-ordering.js";

test("a single-file scene gets no suffix", () => {
  const files = [{ id: "1" }];
  const result = assignSuffixes(files, "Title");
  assert.equal(result[0].basenameNoExt, "Title");
});

test("multi-file scenes get deterministic (2), (3), ... suffixes in the given order", () => {
  const files = [{ id: "1" }, { id: "2" }, { id: "3" }];
  const result = assignSuffixes(files, "Title");
  assert.deepEqual(
    result.map((r) => r.basenameNoExt),
    ["Title", "Title (2)", "Title (3)"],
  );
});

test("the unsuffixed name always goes to whichever file is FIRST in the given order, not whichever has the lowest id", () => {
  const files = [{ id: "20" }, { id: "5" }, { id: "13" }];
  const result = assignSuffixes(files, "Title");
  const byId = Object.fromEntries(
    result.map((r) => [r.file.id, r.basenameNoExt]),
  );
  assert.deepEqual(byId, { 20: "Title", 5: "Title (2)", 13: "Title (3)" });
});
