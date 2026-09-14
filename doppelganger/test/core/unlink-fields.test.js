import test from "node:test";
import assert from "node:assert/strict";
import {
  fieldsSharedWithOthers,
  buildUnlinkInput,
} from "../../src/core/unlink-fields.js";

const wrong = {
  id: "36",
  title: "Beach Day",
  date: "2024-01-01",
  details: "",
  urls: ["https://stashdb.org/scenes/x"],
  studio: { id: "2" },
  performers: [{ id: "2" }, { id: "5" }],
  tags: [{ id: "1" }],
  stash_ids: [
    { endpoint: "https://stashdb.org/graphql", stash_id: "x" },
    { endpoint: "https://theporndb.net/graphql", stash_id: "t" },
  ],
};

const other = {
  id: "37",
  title: "Beach Day",
  date: "2024-01-01",
  details: "Something",
  urls: ["https://stashdb.org/scenes/x"],
  studio: { id: "2" },
  performers: [{ id: "5" }, { id: "2" }],
  tags: [],
  stash_ids: [{ endpoint: "https://stashdb.org/graphql", stash_id: "x" }],
};

test("proposes only fields that are set and identical on another scene", () => {
  assert.deepEqual(fieldsSharedWithOthers(wrong, [other]), [
    "title",
    "date",
    "urls",
    "studio",
    "performers",
  ]);
});

test("list fields compare as sets, ignoring order", () => {
  const a = { ...wrong, performers: [{ id: "1" }, { id: "2" }] };
  const b = { ...other, performers: [{ id: "2" }, { id: "1" }] };
  assert.ok(fieldsSharedWithOthers(a, [b]).includes("performers"));
});

test("nothing is proposed when there is no other scene to agree with", () => {
  assert.deepEqual(fieldsSharedWithOthers(wrong, []), []);
});

test("the update drops only the given stash ID and clears the chosen fields", () => {
  const input = buildUnlinkInput(wrong, "https://stashdb.org/graphql", "x", [
    "title",
    "performers",
  ]);
  assert.deepEqual(input, {
    id: "36",
    stash_ids: [{ endpoint: "https://theporndb.net/graphql", stash_id: "t" }],
    title: "",
    performer_ids: [],
  });
});

test("clearing nothing still removes the stash ID", () => {
  const input = buildUnlinkInput(wrong, "https://stashdb.org/graphql", "x", []);
  assert.deepEqual(Object.keys(input).sort(), ["id", "stash_ids"]);
});
