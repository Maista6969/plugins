import test from "node:test";
import assert from "node:assert/strict";
import { createIntl, createIntlCache } from "react-intl";
import {
  sortEntities,
  normalizeSortCriteria,
  describeSortCriteria,
} from "../../src/core/entity-sort.js";
import messages from "../../src/frontend/i18n/messages/en.json" with { type: "json" };

const intl = createIntl({ locale: "en", messages }, createIntlCache());

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

test("criteria compose: favourites first, best-rated among them, then alphabetical", () => {
  const entities = [
    { id: "1", name: "Zed", favorite: false, rating100: 95 },
    { id: "2", name: "Wendy", favorite: true, rating100: 70 },
    { id: "3", name: "Bo", favorite: false, rating100: null },
    { id: "4", name: "Ada", favorite: true, rating100: 90 },
  ];
  assert.deepEqual(names(sortEntities(entities, ["favorite", "rating"])), [
    "Ada",
    "Wendy",
    "Zed",
    "Bo",
  ]);
  const noFavourites = entities.map((e) => ({ ...e, favorite: false }));
  assert.deepEqual(names(sortEntities(noFavourites, ["favorite", "rating"])), [
    "Zed",
    "Ada",
    "Wendy",
    "Bo",
  ]);
});

test("each legacy string is exactly equivalent to its criteria list", () => {
  const entities = [
    { id: "1", name: "Zed", favorite: false, rating100: 50 },
    { id: "2", name: "Amy", favorite: true, rating100: 90 },
    { id: "3", name: "Bo", favorite: false, rating100: null },
    { id: "4", name: "Cleo", favorite: true, rating100: 90 },
  ];
  assert.deepEqual(
    sortEntities(entities, ["favorite"]),
    sortEntities(entities, "favorite_first"),
  );
  assert.deepEqual(
    sortEntities(entities, ["rating"]),
    sortEntities(entities, "rating"),
  );
  assert.deepEqual(
    sortEntities(entities, ["name"]),
    sortEntities(entities, "alphabetical"),
  );
});

test("rating100 of 0 counts as rated and outranks unrated", () => {
  const entities = [
    { id: "1", name: "Unrated", rating100: null },
    { id: "2", name: "Zero", rating100: 0 },
  ];
  assert.deepEqual(names(sortEntities(entities, ["rating"])), [
    "Zero",
    "Unrated",
  ]);
});

// Librarian's renames must be idempotent!!
test("the sort is total: input order never affects the result, even for identical names", () => {
  const entities = [
    { id: "3", name: "Same", favorite: true, rating100: 50 },
    { id: "1", name: "Same", favorite: true, rating100: 50 },
    { id: "2", name: "same", favorite: true, rating100: 50 },
    { id: "4", name: "Other", favorite: true, rating100: 50 },
  ];
  const permutations = [];
  const permute = (rest, done) => {
    if (rest.length === 0) return permutations.push(done);
    rest.forEach((e, i) =>
      permute(rest.slice(0, i).concat(rest.slice(i + 1)), done.concat([e])),
    );
  };
  permute(entities, []);
  assert.equal(permutations.length, 24);

  for (const criteria of [
    ["name"],
    ["favorite"],
    ["rating"],
    ["favorite", "rating"],
    ["rating", "favorite", "name"],
  ]) {
    const results = permutations.map((p) =>
      sortEntities(p, criteria).map((e) => e.id),
    );
    const first = JSON.stringify(results[0]);
    for (const r of results) {
      assert.equal(
        JSON.stringify(r),
        first,
        "criteria " + criteria.join("+") + " is not a total order",
      );
    }
  }
});

test("unknown or empty criteria degrade to plain alphabetical", () => {
  const entities = [
    { id: "1", name: "Zed" },
    { id: "2", name: "Amy" },
  ];
  assert.deepEqual(names(sortEntities(entities, ["bogus"])), ["Amy", "Zed"]);
  assert.deepEqual(names(sortEntities(entities, [])), ["Amy", "Zed"]);
  assert.deepEqual(names(sortEntities(entities, null)), ["Amy", "Zed"]);
  // duplicates are collapsed rather than applied twice
  assert.deepEqual(names(sortEntities(entities, ["name", "name"])), [
    "Amy",
    "Zed",
  ]);
});

test("normalizeSortCriteria always ends with name, and describeSortCriteria says so", () => {
  assert.deepEqual(normalizeSortCriteria(["favorite", "rating"]), [
    "favorite",
    "rating",
    "name",
  ]);
  assert.deepEqual(normalizeSortCriteria("favorite_first"), [
    "favorite",
    "name",
  ]);
  assert.deepEqual(normalizeSortCriteria(undefined), ["name"]);
  assert.equal(
    describeSortCriteria(intl, ["favorite", "rating"]),
    "Sorted favourites first, highest-rated first, then alphabetically.",
  );
  assert.equal(describeSortCriteria(intl, []), "Sorted alphabetically.");
});
