import test from "node:test";
import assert from "node:assert/strict";
import { sortEntities } from "../../src/core/entity-sort.js";

function names(entities) {
  return entities.map((e) => e.name);
}

test("alphabetical (default) sorts case-insensitively regardless of input order", () => {
  const entities = [
    { id: "1", name: "Zed" },
    { id: "2", name: "amy" },
    { id: "3", name: "Bo" },
  ];
  assert.deepEqual(names(sortEntities(entities, "alphabetical")), [
    "amy",
    "Bo",
    "Zed",
  ]);
  assert.deepEqual(names(sortEntities(entities, undefined)), [
    "amy",
    "Bo",
    "Zed",
  ]);
  assert.deepEqual(names(sortEntities(entities, "nonsense")), [
    "amy",
    "Bo",
    "Zed",
  ]);
});

test("favorite_first puts every favorite before every non-favorite, alphabetical within each group", () => {
  const entities = [
    { id: "1", name: "Zed", favorite: false },
    { id: "2", name: "Amy", favorite: true },
    { id: "3", name: "Bo", favorite: false },
    { id: "4", name: "Cleo", favorite: true },
  ];
  assert.deepEqual(names(sortEntities(entities, "favorite_first")), [
    "Amy",
    "Cleo",
    "Bo",
    "Zed",
  ]);
});

test("rating sorts highest rating100 first, ties broken alphabetically, unrated entities last (still internally alphabetical)", () => {
  const entities = [
    { id: "1", name: "Zed", rating100: 50 },
    { id: "2", name: "Amy", rating100: 90 },
    { id: "3", name: "Bo", rating100: null },
    { id: "4", name: "Cleo", rating100: 90 },
    { id: "5", name: "Ann", rating100: null },
  ];
  assert.deepEqual(names(sortEntities(entities, "rating")), [
    "Amy",
    "Cleo",
    "Zed",
    "Ann",
    "Bo",
  ]);
});

test("rating degrades gracefully to alphabetical when NO entity has a rating100 at all like tags", () => {
  const entities = [
    { id: "1", name: "Zed" },
    { id: "2", name: "Amy" },
  ];
  assert.deepEqual(names(sortEntities(entities, "rating")), ["Amy", "Zed"]);
});

test("a custom getName is used for the alphabetical ordering/tiebreak, not always .name", () => {
  const entities = [
    { id: "1", name: "Zzz Tag", sort_name: "aaa" },
    { id: "2", name: "Aaa Tag" },
  ];
  const sorted = sortEntities(
    entities,
    "alphabetical",
    (e) => e.sort_name || e.name,
  );
  assert.deepEqual(names(sorted), ["Zzz Tag", "Aaa Tag"]);
});

test("handles an empty or missing entity list without throwing", () => {
  assert.deepEqual(sortEntities([], "favorite_first"), []);
  assert.deepEqual(sortEntities(undefined, "rating"), []);
});
