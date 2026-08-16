import test from "node:test";
import assert from "node:assert/strict";
import { groupDuplicateRows } from "../../src/core/group-duplicates.js";

test("groups rows sharing the same stash_id and endpoint together", () => {
  const rows = [
    ["abc", "https://stashdb.org/graphql", 5, "Scene Five"],
    ["abc", "https://stashdb.org/graphql", 12, "Scene Twelve"],
    ["def", "https://stashdb.org/graphql", 3, "Scene Three"],
    ["def", "https://stashdb.org/graphql", 9, "Scene Nine"],
  ];

  const groups = groupDuplicateRows(rows);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.stashId).sort(), ["abc", "def"]);
});

test("keeps groups separate when the same stash_id comes from different endpoints", () => {
  const rows = [
    ["abc", "https://stashdb.org/graphql", 1, "One"],
    ["abc", "https://stashdb.org/graphql", 2, "Two"],
    ["abc", "https://fansdb.cc/graphql", 3, "Three"],
    ["abc", "https://fansdb.cc/graphql", 4, "Four"],
  ];

  const groups = groupDuplicateRows(rows);

  assert.equal(groups.length, 2);
  const endpoints = groups.map((g) => g.endpoint).sort();
  assert.deepEqual(endpoints, [
    "https://fansdb.cc/graphql",
    "https://stashdb.org/graphql",
  ]);
});

test("sorts each group's items by id ascending, oldest first", () => {
  const rows = [
    ["abc", "https://stashdb.org/graphql", 42, "Later"],
    ["abc", "https://stashdb.org/graphql", 7, "Earlier"],
    ["abc", "https://stashdb.org/graphql", 15, "Middle"],
  ];

  const groups = groupDuplicateRows(rows);

  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].items.map((i) => i.id),
    ["7", "15", "42"],
  );
});

test("ids are coerced to strings, matching Stash's own GraphQL ID convention", () => {
  const rows = [
    ["abc", "https://stashdb.org/graphql", 1, "One"],
    ["abc", "https://stashdb.org/graphql", 2, "Two"],
  ];

  const groups = groupDuplicateRows(rows);

  for (const item of groups[0].items) {
    assert.equal(typeof item.id, "string");
  }
});

test("returns an empty list for no rows", () => {
  assert.deepEqual(groupDuplicateRows([]), []);
});
