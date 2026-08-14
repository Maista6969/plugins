import test from "node:test";
import assert from "node:assert/strict";
import {
  isPerformerOp,
  performerMatches,
  performersMatching,
} from "../../src/core/performer-condition.js";
import {
  evaluateCondition,
  describeCondition,
  getMatchedEntityIds,
} from "../../src/core/rule-engine.js";
import { ruleToSceneFilter } from "../../src/core/rule-to-filter.js";
import { normalizeScene } from "../../src/core/normalize-scene.js";
import { ratingInRange } from "../../src/core/rating-range.js";

const RAW_AVA = {
  id: "2",
  name: "Ava Kensington",
  rating100: 70,
  favorite: true,
  custom_fields: { Agency: "Star Models" },
};
const RAW_MARCUS = {
  id: "3",
  name: "Marcus Chen",
  rating100: 95,
  favorite: false,
  custom_fields: { Agency: "Talent Co" },
};
const RAW_NOBODY = { id: "1", name: "Performer for scraping" };

// takes performers as Stash returns them, the same way the planner does
function sceneWith(performers) {
  return normalizeScene({ id: "s", performers: performers });
}

function performerView(raw) {
  return sceneWith([raw]).performers[0];
}

const AVA = performerView(RAW_AVA);
const MARCUS = performerView(RAW_MARCUS);
const NOBODY = performerView(RAW_NOBODY);

const favorite = { field: "performer", op: "favorite", value: [] };
const rating = (min, max) => {
  return { field: "performer", op: "rating", value: { min: min, max: max } };
};
const customField = (key, valueOp, value) => {
  return {
    field: "performer",
    op: "custom_field",
    key: key,
    valueOp: valueOp,
    value: value,
  };
};

test("only the ops that speak about a performer are performer ops", () => {
  assert.equal(isPerformerOp("favorite"), true);
  assert.equal(isPerformerOp("rating"), true);
  assert.equal(isPerformerOp("custom_field"), true);
  // these ask which performers the item has, and are still answered from ids
  assert.equal(isPerformerOp("any_of"), false);
  assert.equal(isPerformerOp("all_of"), false);
  assert.equal(isPerformerOp("is_null"), false);
  assert.equal(isPerformerOp("not_null"), false);
});

test("favourite reads the performer's own flag", () => {
  assert.equal(performerMatches(AVA, favorite), true);
  assert.equal(performerMatches(MARCUS, favorite), false);
  assert.equal(performerMatches(NOBODY, favorite), false);
});

test("a rating range excludes an unrated performer", () => {
  assert.equal(performerMatches(MARCUS, rating(9, 10)), true);
  assert.equal(performerMatches(AVA, rating(9, 10)), false);
  assert.equal(performerMatches(AVA, rating(7, null)), true);
  assert.equal(performerMatches(MARCUS, rating(null, 8)), false);
  // no rating satisfies no range, which is what Stash's BETWEEN does with NULL
  assert.equal(performerMatches(NOBODY, rating(0, 10)), false);
  assert.equal(ratingInRange(null, { min: 0, max: 10 }), false);
  // and a range with neither side set matches nobody rather than everybody
  assert.equal(performerMatches(MARCUS, rating(null, null)), false);
});

test("a performer custom field takes its comparison from valueOp", () => {
  assert.equal(
    performerMatches(MARCUS, customField("Agency", "EQUALS", "Talent Co")),
    true,
  );
  assert.equal(
    performerMatches(AVA, customField("Agency", "EQUALS", "Talent Co")),
    false,
  );
  assert.equal(
    performerMatches(AVA, customField("Agency", "INCLUDES", "star")),
    true,
  );
  assert.equal(
    performerMatches(NOBODY, customField("Agency", "IS_NULL", "")),
    true,
  );
});

// performers_filter is an EXISTS join, so one performer is enough and an item
// with no performers never matches, not even on a negative
test("an item matches as soon as ANY of its performers does", () => {
  assert.equal(
    evaluateCondition(sceneWith([RAW_AVA, RAW_MARCUS]), favorite),
    true,
  );
  assert.equal(evaluateCondition(sceneWith([RAW_MARCUS]), favorite), false);
  assert.equal(evaluateCondition(sceneWith([]), favorite), false);
  assert.equal(
    evaluateCondition(sceneWith([RAW_AVA, RAW_MARCUS]), rating(9, 10)),
    true,
  );
  assert.equal(evaluateCondition(sceneWith([RAW_AVA]), rating(9, 10)), false);
  assert.equal(evaluateCondition(sceneWith([]), rating(0, 10)), false);
  assert.equal(
    evaluateCondition(
      sceneWith([RAW_AVA, RAW_NOBODY]),
      customField("Agency", "IS_NULL", ""),
    ),
    true,
  );
});

test("the id-list performer ops are untouched", () => {
  const view = sceneWith([RAW_AVA, RAW_MARCUS]);
  assert.equal(
    evaluateCondition(view, { field: "performer", op: "any_of", value: ["3"] }),
    true,
  );
  assert.equal(
    evaluateCondition(view, {
      field: "performer",
      op: "all_of",
      value: ["2", "3"],
    }),
    true,
  );
  assert.equal(
    evaluateCondition(view, { field: "performer", op: "is_null", value: [] }),
    false,
  );
  assert.equal(
    evaluateCondition(sceneWith([]), {
      field: "performer",
      op: "is_null",
      value: [],
    }),
    true,
  );
});

// The whole reason evaluateCondition and getMatchedEntityIds share one
// predicate: {matched_performers} puts this answer in a filename, so naming
// somebody the rule did not match on is a wrong rename, not a wrong message
test("{matched_performers} names the performer that satisfied the condition", () => {
  const view = sceneWith([RAW_AVA, RAW_MARCUS, RAW_NOBODY]);
  const matched = (condition) => {
    return getMatchedEntityIds(
      view,
      { conditions: [condition] },
      "performer",
    ).map((id) => {
      return view.performerNames[view.performerIds.indexOf(id)];
    });
  };
  assert.deepEqual(matched(favorite), ["Ava Kensington"]);
  assert.deepEqual(matched(rating(9, 10)), ["Marcus Chen"]);
  assert.deepEqual(matched(rating(0, 10)), ["Ava Kensington", "Marcus Chen"]);
  assert.deepEqual(matched(customField("Agency", "INCLUDES", "Talent")), [
    "Marcus Chen",
  ]);
  // a condition the item does not satisfy contributes nobody
  assert.deepEqual(matched(rating(10, 10)), []);
});

test("a condition that names performers by id still names exactly those", () => {
  const view = sceneWith([RAW_AVA, RAW_MARCUS]);
  assert.deepEqual(
    getMatchedEntityIds(
      view,
      {
        conditions: [{ field: "performer", op: "any_of", value: ["3", "999"] }],
      },
      "performer",
    ),
    // 999 is not on the scene, so it is not "matched" even though it is listed
    ["3"],
  );
});

test("the description names who matched rather than restating the condition", () => {
  const view = sceneWith([RAW_AVA, RAW_MARCUS]);
  assert.equal(
    describeCondition(view, favorite),
    "'Ava Kensington' is a favourite",
  );
  assert.equal(
    describeCondition(view, rating(9, 10)),
    "'Marcus Chen' is rated between 9 and 10",
  );
  assert.equal(
    describeCondition(view, rating(7, null)),
    "'Ava Kensington', 'Marcus Chen' is rated at least 7",
  );
  assert.equal(
    describeCondition(view, customField("Agency", "EQUALS", "Talent Co")),
    "'Marcus Chen'’s custom field \"Agency\" is 'Talent Co'",
  );
});

test("each performer condition becomes the performers_filter Stash takes", () => {
  assert.deepEqual(ruleToSceneFilter({ conditions: [favorite] }), {
    performers_filter: { filter_favorites: true },
  });
  assert.deepEqual(ruleToSceneFilter({ conditions: [rating(9, 10)] }), {
    performers_filter: {
      rating100: { value: 90, value2: 100, modifier: "BETWEEN" },
    },
  });
  // an open side becomes the end of the scale, so the modifier stays BETWEEN
  assert.deepEqual(ruleToSceneFilter({ conditions: [rating(7, null)] }), {
    performers_filter: {
      rating100: { value: 70, value2: 100, modifier: "BETWEEN" },
    },
  });
  assert.deepEqual(
    ruleToSceneFilter({
      conditions: [customField("Agency", "INCLUDES", "Talent")],
    }),
    {
      performers_filter: {
        custom_fields: [
          { field: "Agency", modifier: "INCLUDES", value: ["Talent"] },
        ],
      },
    },
  );
});

test("an unfinished performer condition refuses to become a filter", () => {
  assert.equal(
    ruleToSceneFilter({ conditions: [rating(null, null)] }),
    null,
    "a rating range with neither side set would otherwise match everything",
  );
  assert.equal(
    ruleToSceneFilter({ conditions: [customField("", "EQUALS", "x")] }),
    null,
  );
  assert.equal(
    ruleToSceneFilter({ conditions: [customField("Agency", "EQUALS", "")] }),
    null,
  );
});

// Two conditions are two fragments, so they are two independent EXISTS. Inside
// ONE performers_filter the criteria would have to be met by the same performer,
// which is not what two rows in the editor read like
test("two performer conditions stay separate, so different performers may satisfy them", () => {
  const filter = ruleToSceneFilter({
    conditionLogic: "AND",
    conditions: [favorite, rating(9, 10)],
  });
  assert.deepEqual(filter, {
    performers_filter: { filter_favorites: true },
    AND: {
      performers_filter: {
        rating100: { value: 90, value2: 100, modifier: "BETWEEN" },
      },
    },
  });
  // Ava is the favourite and Marcus is the 9+, and the scene has both
  assert.equal(
    evaluateCondition(sceneWith([RAW_AVA, RAW_MARCUS]), favorite) &&
      evaluateCondition(sceneWith([RAW_AVA, RAW_MARCUS]), rating(9, 10)),
    true,
  );
});

test("performersMatching returns the performers, not just whether any matched", () => {
  assert.deepEqual(
    performersMatching([AVA, MARCUS, NOBODY], rating(0, 10)).map((p) => {
      return p.name;
    }),
    ["Ava Kensington", "Marcus Chen"],
  );
  assert.deepEqual(performersMatching(null, favorite), []);
});
