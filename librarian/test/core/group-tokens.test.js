import test from "node:test";
import assert from "node:assert/strict";
import { normalizeScene } from "../../src/core/normalize-scene.js";
import {
  buildTokens,
  renderTemplate,
  findMissingRequiredData,
  resolveSceneGroup,
  METADATA_TOKENS,
} from "../../src/core/path-template.js";
import { normalizeConfig } from "../../src/core/config-schema.js";

function rawScene(title, groups) {
  return {
    id: "1",
    title: title,
    organized: true,
    studio: null,
    performers: [],
    tags: [],
    stash_ids: [],
    files: [],
    groups: groups,
  };
}

const render = (pattern, view) =>
  renderTemplate(pattern, buildTokens(view, normalizeConfig({}), null));

test("a movie's scenes render as folder and running order", () => {
  const first = normalizeScene(
    rawScene("Anita Goes Hard", [
      { scene_index: 1, group: { id: "7", name: "Teen Dreams" } },
    ]),
    "scenes",
  );
  const second = normalizeScene(
    rawScene("Betty Does Too", [
      { scene_index: 2, group: { id: "7", name: "Teen Dreams" } },
    ]),
    "scenes",
  );
  const pattern = "{title} [Sc. {group_idx}]";
  assert.equal(render("{group}", first), "Teen Dreams");
  assert.equal(render(pattern, first), "Anita Goes Hard [Sc. 1]");
  assert.equal(render(pattern, second), "Betty Does Too [Sc. 2]");
});

// Stash returns a scene's groups unordered, so the pick is ours: lowest id, the
// group created first. Stable across runs, and unaffected by a rename
test("several groups resolve to the lowest id, whatever order Stash returned", () => {
  const view = normalizeScene(
    rawScene("Anita Goes Hard", [
      { scene_index: 9, group: { id: "42", name: "Later Compilation" } },
      { scene_index: 1, group: { id: "7", name: "Teen Dreams" } },
    ]),
    "scenes",
  );
  assert.equal(render("{group}", view), "Teen Dreams");
  assert.equal(render("{group_idx}", view), "1");
  const chosen = resolveSceneGroup(view);
  assert.equal(chosen.group.name, "Teen Dreams");
  assert.equal(chosen.ambiguous, true);
});

// the whole reason both tokens read from one resolution point: chosen
// separately, {group} could name one movie and {group_idx} answer for another
test("both tokens always speak for the same group", () => {
  const view = normalizeScene(
    rawScene("Anita Goes Hard", [
      { scene_index: 4, group: { id: "42", name: "Later Compilation" } },
      { scene_index: 1, group: { id: "7", name: "Teen Dreams" } },
    ]),
    "scenes",
  );
  assert.equal(
    render("{group} [Sc. {group_idx}]", view),
    "Teen Dreams [Sc. 1]",
  );
});

test("a scene in no group reports missing data, and {group?} opts out", () => {
  const view = normalizeScene(rawScene("Loose Scene", []), "scenes");
  assert.deepEqual(
    findMissingRequiredData(["{group}"], view, null, "scene").map(
      (m) => m.token,
    ),
    ["group"],
  );
  assert.deepEqual(
    findMissingRequiredData(["{group?}"], view, null, "scene"),
    [],
  );
  assert.equal(render("{group?}", view), "");
});

// scene_index is nullable: being in a movie without a place in its order is
// missing data, not index 0
test("a group with no running order reports that, naming the group", () => {
  const view = normalizeScene(
    rawScene("Extra", [
      { scene_index: null, group: { id: "7", name: "Teen Dreams" } },
    ]),
    "scenes",
  );
  assert.equal(render("{group}", view), "Teen Dreams");
  const missing = findMissingRequiredData(["{group_idx}"], view, null, "scene");
  assert.equal(missing.length, 1);
  assert.match(missing[0].message, /Teen Dreams/);
  assert.match(missing[0].message, /running order/);
});

test("index 0 is a real position, not absence", () => {
  const view = normalizeScene(
    rawScene("Cold Open", [
      { scene_index: 0, group: { id: "7", name: "Teen Dreams" } },
    ]),
    "scenes",
  );
  assert.equal(render("{group_idx}", view), "0");
  assert.deepEqual(
    findMissingRequiredData(["{group_idx}"], view, null, "scene"),
    [],
  );
});

// only scenes have groups, so the gallery and image token sets must not offer them
test("group tokens are scene-only", () => {
  assert.equal(METADATA_TOKENS.indexOf("group"), -1);
  assert.equal(METADATA_TOKENS.indexOf("group_idx"), -1);
});
