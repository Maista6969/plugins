import test from "node:test";
import assert from "node:assert/strict";
import { isStudioTraitOp } from "../../src/core/studio-condition.js";
import {
  evaluateCondition,
  describeCondition,
} from "../../src/core/rule-engine.js";
import { ruleToSceneFilter } from "../../src/core/rule-to-filter.js";
import { normalizeScene } from "../../src/core/normalize-scene.js";

function sceneWithStudio(studio) {
  return normalizeScene({ id: "s", studio: studio });
}

const RAW_LEAF = {
  id: "st1",
  name: "Leaf Studio",
  favorite: true,
  rating100: 80,
  custom_fields: {},
  parent_studio: {
    id: "st0",
    name: "Parent Co",
    favorite: false,
    rating100: 20,
    custom_fields: {},
  },
};

const favorite = { field: "studio", op: "favorite", value: [] };
const notFavorite = { field: "studio", op: "not_favorite", value: [] };
const rating = (min, max) => {
  return { field: "studio", op: "rating", value: { min: min, max: max } };
};
const notRated = { field: "studio", op: "not_rated", value: [] };

test("the studio trait ops are exactly favorite/not_favorite/rating/not_rated/custom_field", () => {
  assert.equal(isStudioTraitOp("favorite"), true);
  assert.equal(isStudioTraitOp("not_favorite"), true);
  assert.equal(isStudioTraitOp("rating"), true);
  assert.equal(isStudioTraitOp("not_rated"), true);
  assert.equal(isStudioTraitOp("custom_field"), true);
  // these ask which studio it is, and are unaffected
  assert.equal(isStudioTraitOp("any_of"), false);
  assert.equal(isStudioTraitOp("any_of_or_descendant"), false);
  assert.equal(isStudioTraitOp("is_null"), false);
  assert.equal(isStudioTraitOp("not_null"), false);
});

// rating's condition.value is 0-10, same scale performer-condition.test.js
// uses, converted to the stored 0-100 rating100 internally
test("favorite/rating read the scene's own (leaf) studio, not its parent", () => {
  const view = sceneWithStudio(RAW_LEAF);
  assert.equal(evaluateCondition(view, favorite), true);
  assert.equal(evaluateCondition(view, notFavorite), false);
  // leaf is rating100 80 (8.0); parent is rating100 20 (2.0)
  assert.equal(evaluateCondition(view, rating(7, 9)), true);
  assert.equal(
    evaluateCondition(view, rating(0, 3)),
    false,
    "that range fits the parent, not the leaf",
  );
  assert.equal(evaluateCondition(view, notRated), false);
});

test("not_favorite/not_rated hold when the scene has no studio at all", () => {
  const noStudio = sceneWithStudio(null);
  assert.equal(evaluateCondition(noStudio, favorite), false);
  assert.equal(evaluateCondition(noStudio, notFavorite), true);
  assert.equal(evaluateCondition(noStudio, rating(0, 10)), false);
  assert.equal(evaluateCondition(noStudio, notRated), true);
});

test("a studio trait condition names the studio in its description", () => {
  const view = sceneWithStudio(RAW_LEAF);
  assert.equal(
    describeCondition(view, favorite),
    "studio 'Leaf Studio' is a favourite",
  );
  assert.equal(
    describeCondition(view, rating(7, 9)),
    "studio 'Leaf Studio' is rated between 7 and 9",
  );
  assert.equal(
    describeCondition(sceneWithStudio(null), notRated),
    "the studio has no rating",
  );
});

test("studio trait conditions become studios_filter, matching the performers_filter shape", () => {
  assert.deepEqual(ruleToSceneFilter({ conditions: [favorite] }), {
    studios_filter: { favorite: true },
  });
  assert.deepEqual(ruleToSceneFilter({ conditions: [notFavorite] }), {
    studios_filter: { favorite: false },
  });
  assert.deepEqual(ruleToSceneFilter({ conditions: [notRated] }), {
    studios_filter: { rating100: { value: 0, modifier: "IS_NULL" } },
  });
  assert.deepEqual(ruleToSceneFilter({ conditions: [rating(7, 9)] }), {
    studios_filter: {
      rating100: { value: 70, value2: 90, modifier: "BETWEEN" },
    },
  });
});
