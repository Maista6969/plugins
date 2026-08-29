import test from "node:test";
import assert from "node:assert/strict";
import {
  countInRange,
  countRangeCriterion,
  describeCountRange,
  isEmptyCountRange,
} from "../../src/core/count-range.js";
import {
  evaluateCondition,
  describeCondition,
} from "../../src/core/rule-engine.js";
import { ruleToSceneFilter } from "../../src/core/rule-to-filter.js";
import { normalizeScene } from "../../src/core/normalize-scene.js";

function sceneWith(performers, tags) {
  return normalizeScene({
    id: "s",
    performers: performers || [],
    tags: tags || [],
  });
}

const performerCount = (min, max) => {
  return {
    field: "performer_count",
    op: "any_of",
    value: { min: min, max: max },
  };
};
const tagCount = (min, max) => {
  return { field: "tag_count", op: "any_of", value: { min: min, max: max } };
};

test("countInRange respects either side being open, like ratingInRange", () => {
  assert.equal(countInRange(3, { min: 2, max: 5 }), true);
  assert.equal(countInRange(1, { min: 2, max: 5 }), false);
  assert.equal(countInRange(6, { min: 2, max: 5 }), false);
  assert.equal(countInRange(10, { min: 2, max: null }), true);
  assert.equal(countInRange(1, { min: 2, max: null }), false);
  assert.equal(countInRange(0, { min: null, max: 0 }), true);
  // a range with neither side set matches nothing, same as rating
  assert.equal(countInRange(5, { min: null, max: null }), false);
  assert.equal(countInRange(null, { min: 0, max: 10 }), false);
});

test("isEmptyCountRange/countRangeCriterion mirror the rating-range shape", () => {
  assert.equal(isEmptyCountRange(null), true);
  assert.equal(isEmptyCountRange({ min: null, max: null }), true);
  assert.equal(isEmptyCountRange({ min: 1, max: null }), false);
  assert.deepEqual(countRangeCriterion({ min: null, max: null }), null);
  assert.deepEqual(countRangeCriterion({ min: 2, max: 5 }), {
    value: 2,
    value2: 5,
    modifier: "BETWEEN",
  });
  // an open side still needs both sides of BETWEEN, unbounded rather than
  // capped at a domain-specific ceiling the way rating uses 100
  assert.deepEqual(countRangeCriterion({ min: 2, max: null }), {
    value: 2,
    value2: Number.MAX_SAFE_INTEGER,
    modifier: "BETWEEN",
  });
  assert.deepEqual(countRangeCriterion({ min: null, max: 5 }), {
    value: 0,
    value2: 5,
    modifier: "BETWEEN",
  });
});

test("describeCountRange reads the same as describeRatingRange", () => {
  assert.equal(describeCountRange({ min: 2, max: 5 }), "between 2 and 5");
  assert.equal(describeCountRange({ min: 2, max: null }), "at least 2");
  assert.equal(describeCountRange({ min: null, max: 5 }), "at most 5");
  assert.equal(describeCountRange({ min: null, max: null }), "");
});

const p = (id) => {
  return { id: id, name: "P" + id };
};
const t = (id) => {
  return { id: id, name: "T" + id };
};

test("performer_count/tag_count read the scene's own performer/tag counts", () => {
  const view = sceneWith([p("1"), p("2"), p("3")], [t("1")]);
  assert.equal(evaluateCondition(view, performerCount(2, 5)), true);
  assert.equal(evaluateCondition(view, performerCount(4, 5)), false);
  assert.equal(evaluateCondition(view, tagCount(1, 1)), true);
  assert.equal(evaluateCondition(view, tagCount(2, null)), false);
  // zero performers/tags is a valid count, not missing data
  assert.equal(
    evaluateCondition(sceneWith([], []), performerCount(0, 0)),
    true,
  );
  assert.equal(evaluateCondition(sceneWith([], []), tagCount(0, 0)), true);
});

test("performer_count/tag_count describe as a plain range, like rating", () => {
  const view = sceneWith([p("1")], []);
  assert.equal(
    describeCondition(view, performerCount(2, 5)),
    "performer count is between 2 and 5",
  );
  assert.equal(
    describeCondition(view, tagCount(1, null)),
    "tag count is at least 1",
  );
});

test("performer_count/tag_count become the criteria Stash takes", () => {
  assert.deepEqual(ruleToSceneFilter({ conditions: [performerCount(1, 1)] }), {
    performer_count: { value: 1, value2: 1, modifier: "BETWEEN" },
  });
  assert.deepEqual(ruleToSceneFilter({ conditions: [tagCount(3, null)] }), {
    tag_count: {
      value: 3,
      value2: Number.MAX_SAFE_INTEGER,
      modifier: "BETWEEN",
    },
  });
});

test("an empty performer_count/tag_count range refuses to become a filter", () => {
  assert.equal(
    ruleToSceneFilter({ conditions: [performerCount(null, null)] }),
    null,
  );
  assert.equal(ruleToSceneFilter({ conditions: [tagCount(null, null)] }), null);
});
