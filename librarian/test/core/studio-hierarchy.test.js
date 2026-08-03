import test from "node:test";
import assert from "node:assert/strict";
import {
  walkStudioChain,
  MAX_STUDIO_DEPTH,
} from "../../src/core/studio-hierarchy.js";

test("returns [] for a null studio", () => {
  assert.deepEqual(walkStudioChain(null), []);
  assert.deepEqual(walkStudioChain(undefined), []);
});

test("returns a single-element chain for a studio with no parent, carrying id and name", () => {
  assert.deepEqual(
    walkStudioChain({ id: "1", name: "Solo", parent_studio: null }),
    [{ id: "1", name: "Solo" }],
  );
});

test("walks a multi-level chain root-first, leaf-last", () => {
  const studio = {
    id: "3",
    name: "Leaf",
    parent_studio: {
      id: "2",
      name: "Mid",
      parent_studio: { id: "1", name: "Root", parent_studio: null },
    },
  };
  assert.deepEqual(walkStudioChain(studio), [
    { id: "1", name: "Root" },
    { id: "2", name: "Mid" },
    { id: "3", name: "Leaf" },
  ]);
});

test("missing parent_studio at various depths stops the walk cleanly", () => {
  const studio = {
    id: "2",
    name: "Leaf",
    parent_studio: { id: "1", name: "Mid" },
  }; // Mid.parent_studio is undefined
  assert.deepEqual(walkStudioChain(studio), [
    { id: "1", name: "Mid" },
    { id: "2", name: "Leaf" },
  ]);
});

test("ids are coerced to strings", () => {
  assert.deepEqual(
    walkStudioChain({ id: 42, name: "Numeric Id", parent_studio: null }),
    [{ id: "42", name: "Numeric Id" }],
  );
});

test("defensively caps depth even against a fixture nested past MAX_STUDIO_DEPTH", () => {
  let studio = { id: "root", name: "Root", parent_studio: null };
  for (let i = 1; i <= MAX_STUDIO_DEPTH + 5; i++) {
    studio = { id: "level" + i, name: "Level" + i, parent_studio: studio };
  }
  const chain = walkStudioChain(studio);
  assert.equal(chain.length, MAX_STUDIO_DEPTH);
  assert.ok(!chain.some((s) => s.name === "Root"));
});
