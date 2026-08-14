import test from "node:test";
import assert from "node:assert/strict";
import { normalizeScene } from "../../src/core/normalize-scene.js";

test("passes rating100 through as-is, defaulting to null when absent (unrated, not zero)", () => {
  assert.equal(normalizeScene({ id: "1", rating100: 85 }).rating100, 85);
  assert.equal(normalizeScene({ id: "1" }).rating100, null);
  assert.equal(normalizeScene({ id: "1", rating100: 0 }).rating100, 0);
});

test("passes code through as-is, defaulting to '' when absent", () => {
  assert.equal(normalizeScene({ id: "1", code: "ABC-123" }).code, "ABC-123");
  assert.equal(normalizeScene({ id: "1" }).code, "");
  assert.equal(normalizeScene({ id: "1", code: null }).code, "");
});

test("flattens studio chain, alpha-sorts performers and tags, and keeps ids aligned with the sorted order", () => {
  const raw = {
    id: "1",
    title: "T",
    date: "2024-01-01",
    organized: true,
    studio: {
      id: "s-leaf",
      name: "Leaf",
      parent_studio: { id: "s-root", name: "Root", parent_studio: null },
    },
    performers: [
      { id: "p-zed", name: "Zed" },
      { id: "p-amy", name: "Amy" },
    ],
    tags: [
      { id: "t-rock", name: "Rock" },
      { id: "t-instrumental", name: "Instrumental" },
    ],
    files: [{ id: "1" }],
  };
  const view = normalizeScene(raw);
  assert.deepEqual(view.studioNames, ["Root", "Leaf"]);
  assert.deepEqual(view.studioIds, ["s-root", "s-leaf"]);
  assert.deepEqual(view.performerNames, ["Amy", "Zed"]);
  assert.deepEqual(view.performerIds, ["p-amy", "p-zed"]);
  assert.deepEqual(view.tagNames, ["Instrumental", "Rock"]);
  assert.deepEqual(view.tagIds, ["t-instrumental", "t-rock"]);
});

test("performer/tag sort is case-insensitive", () => {
  const raw = {
    id: "1",
    performers: [
      { id: "p-banana", name: "Banana" },
      { id: "p-apple", name: "apple" },
    ],
    tags: [
      { id: "t-zebra", name: "zebra" },
      { id: "t-antelope", name: "Antelope" },
    ],
    files: [],
  };
  const view = normalizeScene(raw);
  assert.deepEqual(view.performerNames, ["apple", "Banana"]);
  assert.deepEqual(view.tagNames, ["Antelope", "zebra"]);
});

test("tag sort prefers sort_name over name", () => {
  const raw = {
    id: "1",
    tags: [
      { id: "t-1", name: "Zzz Tag", sort_name: "aaa" },
      { id: "t-2", name: "Aaa Tag" },
    ],
    files: [],
  };
  const view = normalizeScene(raw);
  assert.deepEqual(view.tagNames, ["Zzz Tag", "Aaa Tag"]);
});

test("handles missing studio/performers/tags/files gracefully", () => {
  const raw = { id: "1", organized: false };
  const view = normalizeScene(raw);
  assert.deepEqual(view.studioNames, []);
  assert.deepEqual(view.studioIds, []);
  assert.deepEqual(view.performerNames, []);
  assert.deepEqual(view.performerIds, []);
  assert.deepEqual(view.tagNames, []);
  assert.deepEqual(view.tagIds, []);
  assert.deepEqual(view.files, []);
  assert.equal(view.title, "");
  assert.equal(view.date, "");
  assert.equal(view.organized, false);
});

test("performer/tag ids are coerced to strings", () => {
  const raw = {
    performers: [{ id: 42, name: "Numeric Id" }],
    tags: [{ id: 7, name: "Numeric Tag" }],
  };
  const view = normalizeScene(raw);
  assert.deepEqual(view.performerIds, ["42"]);
  assert.deepEqual(view.tagIds, ["7"]);
});

test("hasStashId reflects whether stash_ids has at least one entry", () => {
  assert.equal(normalizeScene({ id: "1" }).hasStashId, false);
  assert.equal(normalizeScene({ id: "1", stash_ids: [] }).hasStashId, false);
  assert.equal(
    normalizeScene({ id: "1", stash_ids: [{ endpoint: "e", stash_id: "s" }] })
      .hasStashId,
    true,
  );
});

test("stashIds carries every {endpoint, stash_id} pair through", () => {
  assert.deepEqual(normalizeScene({ id: "1" }).stashIds, []);
  assert.deepEqual(
    normalizeScene({
      id: "1",
      stash_ids: [
        { endpoint: "https://stashdb.org/graphql", stash_id: "aaa" },
        { endpoint: "https://theporndb.net/graphql", stash_id: "bbb" },
      ],
    }).stashIds,
    [
      { endpoint: "https://stashdb.org/graphql", stash_id: "aaa" },
      { endpoint: "https://theporndb.net/graphql", stash_id: "bbb" },
    ],
  );
});

test("organized coerces to a real boolean", () => {
  assert.equal(normalizeScene({ organized: undefined }).organized, false);
  assert.equal(normalizeScene({ organized: true }).organized, true);
});

test("performers expose favorite, rating100, gender and custom fields alongside id/name", () => {
  const raw = {
    performers: [
      {
        id: "p1",
        name: "Amy",
        favorite: true,
        rating100: 90,
        gender: "FEMALE",
        custom_fields: { Agency: "Talent Co" },
      },
    ],
    tags: [{ id: "t1", name: "Rock", favorite: true }],
  };
  const view = normalizeScene(raw);
  assert.deepEqual(view.performers, [
    {
      id: "p1",
      name: "Amy",
      favorite: true,
      rating100: 90,
      gender: "female",
      customFields: { Agency: "Talent Co" },
    },
  ]);
  assert.deepEqual(view.tags, [{ id: "t1", name: "Rock" }]);
});

test("performers default favorite to false and rating100/gender to null when absent", () => {
  const raw = {
    performers: [{ id: "p1", name: "Amy" }],
    tags: [{ id: "t1", name: "Rock" }],
  };
  const view = normalizeScene(raw);
  assert.equal(view.performers[0].favorite, false);
  assert.equal(view.performers[0].rating100, null);
  assert.equal(view.performers[0].gender, null);
});

test("canonicalises every GenderEnum value to its pattern spelling", () => {
  const genderOf = (raw) =>
    normalizeScene({ performers: [{ id: "p1", name: "A", gender: raw }] })
      .performers[0].gender;
  assert.equal(genderOf("FEMALE"), "female");
  assert.equal(genderOf("MALE"), "male");
  assert.equal(genderOf("TRANSGENDER_FEMALE"), "trans_female");
  assert.equal(genderOf("TRANSGENDER_MALE"), "trans_male");
  assert.equal(genderOf("INTERSEX"), "intersex");
  assert.equal(genderOf("NON_BINARY"), "non_binary");
  assert.equal(genderOf(null), null);
  assert.equal(genderOf(""), null);
  assert.equal(genderOf("AGENDER"), null);
});
