import test from "node:test";
import assert from "node:assert/strict";
import {
  dateInRange,
  dateRangeCriterion,
  describeDateRange,
  isEmptyDateRange,
} from "../../src/core/date-range.js";
import {
  evaluateCondition,
  describeCondition,
} from "../../src/core/rule-engine.js";
import { ruleToSceneFilter } from "../../src/core/rule-to-filter.js";
import { normalizeScene } from "../../src/core/normalize-scene.js";

function sceneWith(date) {
  return normalizeScene({ id: "s", date: date });
}

const dateRange = (min, max) => {
  return { field: "date", op: "range", value: { min: min, max: max } };
};
const dateIsSet = {
  field: "date",
  op: "not_null",
  value: { min: null, max: null },
};
const dateIsNotSet = {
  field: "date",
  op: "is_null",
  value: { min: null, max: null },
};

test("dateInRange defaults a partial date to the 1st, matching Stash's own server-side resolution", () => {
  assert.equal(dateInRange("2024", { min: "2024-01-01", max: null }), true);
  assert.equal(dateInRange("2024", { min: "2024-01-02", max: null }), false);
  assert.equal(
    dateInRange("2024-06", { min: "2024-06-01", max: "2024-06-01" }),
    true,
  );
  assert.equal(dateInRange("2024-06", { min: "2024-06-02", max: null }), false);
  // full dates compare normally
  assert.equal(
    dateInRange("2024-06-15", { min: "2024-01-01", max: "2024-12-31" }),
    true,
  );
  assert.equal(
    dateInRange("2025-01-01", { min: "2024-01-01", max: "2024-12-31" }),
    false,
  );
});

test("dateInRange respects either side being open, and matches nothing with no date or no range", () => {
  assert.equal(
    dateInRange("2024-05-01", { min: "2024-01-01", max: null }),
    true,
  );
  assert.equal(
    dateInRange("2023-12-31", { min: "2024-01-01", max: null }),
    false,
  );
  assert.equal(
    dateInRange("2024-05-01", { min: null, max: "2024-12-31" }),
    true,
  );
  assert.equal(
    dateInRange("2025-01-01", { min: null, max: "2024-12-31" }),
    false,
  );
  assert.equal(dateInRange("", { min: "2024-01-01", max: null }), false);
  assert.equal(dateInRange(null, { min: "2024-01-01", max: null }), false);
  assert.equal(dateInRange("2024-05-01", { min: null, max: null }), false);
});

test("isEmptyDateRange/dateRangeCriterion mirror the count-range shape, with date sentinels", () => {
  assert.equal(isEmptyDateRange(null), true);
  assert.equal(isEmptyDateRange({ min: null, max: null }), true);
  assert.equal(isEmptyDateRange({ min: "2024-01-01", max: null }), false);
  assert.deepEqual(dateRangeCriterion({ min: null, max: null }), null);
  assert.deepEqual(
    dateRangeCriterion({ min: "2024-01-01", max: "2024-12-31" }),
    {
      value: "2024-01-01",
      value2: "2024-12-31",
      modifier: "BETWEEN",
    },
  );
  assert.deepEqual(dateRangeCriterion({ min: "2024-01-01", max: null }), {
    value: "2024-01-01",
    value2: "9999-12-31",
    modifier: "BETWEEN",
  });
  assert.deepEqual(dateRangeCriterion({ min: null, max: "2024-12-31" }), {
    value: "0001-01-01",
    value2: "2024-12-31",
    modifier: "BETWEEN",
  });
});

test("describeDateRange names on-or-after/on-or-before to be explicit about the inclusive end", () => {
  assert.equal(
    describeDateRange({ min: "2024-01-01", max: "2024-12-31" }),
    "between 2024-01-01 and 2024-12-31",
  );
  assert.equal(
    describeDateRange({ min: "2024-01-01", max: null }),
    "on or after 2024-01-01",
  );
  assert.equal(
    describeDateRange({ min: null, max: "2024-12-31" }),
    "on or before 2024-12-31",
  );
  assert.equal(describeDateRange({ min: null, max: null }), "");
});

test("a date condition reads the scene's own date, is/is not set, or a range", () => {
  assert.equal(evaluateCondition(sceneWith("2024-06-15"), dateIsSet), true);
  assert.equal(evaluateCondition(sceneWith(""), dateIsSet), false);
  assert.equal(evaluateCondition(sceneWith(""), dateIsNotSet), true);
  assert.equal(evaluateCondition(sceneWith("2024-06-15"), dateIsNotSet), false);
  assert.equal(
    evaluateCondition(
      sceneWith("2024-06-15"),
      dateRange("2024-01-01", "2024-12-31"),
    ),
    true,
  );
  assert.equal(
    evaluateCondition(
      sceneWith("2025-01-01"),
      dateRange("2024-01-01", "2024-12-31"),
    ),
    false,
  );
  // a scene dated only by year compares as if it were the 1st
  assert.equal(
    evaluateCondition(sceneWith("2024"), dateRange("2024-01-01", null)),
    true,
  );
});

test("describeCondition names date is set/not set, or the range", () => {
  const view = sceneWith("2024-06-15");
  assert.equal(describeCondition(view, dateIsSet), "date is set");
  assert.equal(describeCondition(view, dateIsNotSet), "date is not set");
  assert.equal(
    describeCondition(view, dateRange("2024-01-01", null)),
    "date is on or after 2024-01-01",
  );
});

test("date becomes the criterion Stash takes, is_null/not_null included", () => {
  assert.deepEqual(
    ruleToSceneFilter({ conditions: [dateRange("2024-01-01", "2024-12-31")] }),
    {
      date: { value: "2024-01-01", value2: "2024-12-31", modifier: "BETWEEN" },
    },
  );
  assert.deepEqual(ruleToSceneFilter({ conditions: [dateIsSet] }), {
    date: { value: "", modifier: "NOT_NULL" },
  });
  assert.deepEqual(ruleToSceneFilter({ conditions: [dateIsNotSet] }), {
    date: { value: "", modifier: "IS_NULL" },
  });
});

test("an empty date range refuses to become a filter", () => {
  assert.equal(
    ruleToSceneFilter({ conditions: [dateRange(null, null)] }),
    null,
  );
});
