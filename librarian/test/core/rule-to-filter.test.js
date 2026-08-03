import test from "node:test";
import assert from "node:assert/strict";
import {
  ruleToSceneFilter,
  ruleToPreviewFilter,
} from "../../src/core/rule-to-filter.js";

function rule(overrides) {
  return Object.assign({ conditionLogic: "AND", conditions: [] }, overrides);
}

test("studio condition translates to studios/depth:0 (exact match, no descendants)", () => {
  const filter = ruleToSceneFilter(
    rule({ conditions: [{ field: "studio", op: "any_of", value: ["s1"] }] }),
  );
  assert.deepEqual(filter, {
    studios: { value: ["s1"], modifier: "INCLUDES", depth: 0 },
  });
});

test("performer condition: any_of -> INCLUDES, all_of -> INCLUDES_ALL", () => {
  const anyOf = ruleToSceneFilter(
    rule({
      conditions: [{ field: "performer", op: "any_of", value: ["p1", "p2"] }],
    }),
  );
  assert.deepEqual(anyOf, {
    performers: { value: ["p1", "p2"], modifier: "INCLUDES" },
  });

  const allOf = ruleToSceneFilter(
    rule({
      conditions: [{ field: "performer", op: "all_of", value: ["p1", "p2"] }],
    }),
  );
  assert.deepEqual(allOf, {
    performers: { value: ["p1", "p2"], modifier: "INCLUDES_ALL" },
  });
});

test("tag condition always uses depth:0 — our own tag matching is flat, never expanding to child tags", () => {
  const filter = ruleToSceneFilter(
    rule({ conditions: [{ field: "tag", op: "all_of", value: ["t1", "t2"] }] }),
  );
  assert.deepEqual(filter, {
    tags: { value: ["t1", "t2"], modifier: "INCLUDES_ALL", depth: 0 },
  });
});

test("is_null/not_null translate to real Stash IS_NULL/NOT_NULL modifiers, with an empty value array, even when `value` has stale ids in it", () => {
  const studioIsNull = ruleToSceneFilter(
    rule({
      conditions: [{ field: "studio", op: "is_null", value: ["stale-id"] }],
    }),
  );
  assert.deepEqual(studioIsNull, {
    studios: { value: [], modifier: "IS_NULL", depth: 0 },
  });

  const performerIsNull = ruleToSceneFilter(
    rule({ conditions: [{ field: "performer", op: "is_null", value: [] }] }),
  );
  assert.deepEqual(performerIsNull, {
    performers: { value: [], modifier: "IS_NULL" },
  });

  const tagNotNull = ruleToSceneFilter(
    rule({ conditions: [{ field: "tag", op: "not_null", value: [] }] }),
  );
  assert.deepEqual(tagNotNull, {
    tags: { value: [], modifier: "NOT_NULL", depth: 0 },
  });
});

test("path condition translates directly to a path StringCriterionInput (op is already a real CriterionModifier)", () => {
  const filter = ruleToSceneFilter(
    rule({
      conditions: [{ field: "path", op: "INCLUDES", value: "/data/old" }],
    }),
  );
  assert.deepEqual(filter, {
    path: { value: "/data/old", modifier: "INCLUDES" },
  });
});

test("path condition passes through non-default modifiers unchanged (EXCLUDES, MATCHES_REGEX, ...)", () => {
  const excludes = ruleToSceneFilter(
    rule({
      conditions: [{ field: "path", op: "EXCLUDES", value: "/data/keep" }],
    }),
  );
  assert.deepEqual(excludes, {
    path: { value: "/data/keep", modifier: "EXCLUDES" },
  });

  const regex = ruleToSceneFilter(
    rule({
      conditions: [
        { field: "path", op: "MATCHES_REGEX", value: "^/data/\\d+" },
      ],
    }),
  );
  assert.deepEqual(regex, {
    path: { value: "^/data/\\d+", modifier: "MATCHES_REGEX" },
  });
});

test("a path condition with no value typed yet is not translatable", () => {
  assert.equal(
    ruleToSceneFilter(
      rule({ conditions: [{ field: "path", op: "INCLUDES", value: "" }] }),
    ),
    null,
  );
});

test("a path condition alongside another condition translates the WHOLE set, not just the path one", () => {
  const r = rule({
    conditionLogic: "OR",
    conditions: [
      { field: "tag", op: "any_of", value: ["t1"] },
      { field: "path", op: "INCLUDES", value: "/data/old" },
    ],
  });
  const filter = ruleToSceneFilter(r);
  assert.deepEqual(filter, {
    tags: { value: ["t1"], modifier: "INCLUDES", depth: 0 },
    OR: { path: { value: "/data/old", modifier: "INCLUDES" } },
  });
});

test("rating condition with both bounds converts 0-10 scale to 0-100 via BETWEEN (inclusive both ends)", () => {
  const filter = ruleToSceneFilter(
    rule({ conditions: [{ field: "rating", value: { min: 8, max: 10 } }] }),
  );
  assert.deepEqual(filter, {
    rating100: { value: 80, value2: 100, modifier: "BETWEEN" },
  });
});

test("rating condition with only a min bound defaults the max side to 100 (the top of the real scale)", () => {
  const filter = ruleToSceneFilter(
    rule({ conditions: [{ field: "rating", value: { min: 5, max: null } }] }),
  );
  assert.deepEqual(filter, {
    rating100: { value: 50, value2: 100, modifier: "BETWEEN" },
  });
});

test("rating condition with only a max bound defaults the min side to 0", () => {
  const filter = ruleToSceneFilter(
    rule({ conditions: [{ field: "rating", value: { min: null, max: 3 } }] }),
  );
  assert.deepEqual(filter, {
    rating100: { value: 0, value2: 30, modifier: "BETWEEN" },
  });
});

test("rating condition with both bounds null is not translatable", () => {
  const filter = ruleToSceneFilter(
    rule({
      conditions: [{ field: "rating", value: { min: null, max: null } }],
    }),
  );
  assert.equal(filter, null);
});

test("a rule with zero conditions is not translatable", () => {
  assert.equal(ruleToSceneFilter(rule({ conditions: [] })), null);
});

test("a condition with an empty value list is not translatable (nothing selected yet while editing)", () => {
  assert.equal(
    ruleToSceneFilter(
      rule({ conditions: [{ field: "tag", op: "any_of", value: [] }] }),
    ),
    null,
  );
});

test("the 'contains' op has no ID-based filter equivalent and is not translatable", () => {
  assert.equal(
    ruleToSceneFilter(
      rule({ conditions: [{ field: "tag", op: "contains", value: ["t1"] }] }),
    ),
    null,
  );
});

test("an unknown condition field is not translatable", () => {
  assert.equal(
    ruleToSceneFilter(
      rule({ conditions: [{ field: "title", op: "any_of", value: ["x"] }] }),
    ),
    null,
  );
});

test("if ANY condition in the rule is untranslatable, the whole rule is untranslatable (never a partial approximation)", () => {
  const r = rule({
    conditions: [
      { field: "tag", op: "any_of", value: ["t1"] },
      { field: "performer", op: "contains", value: ["p1"] },
    ],
  });
  assert.equal(ruleToSceneFilter(r), null);
});

test("a single condition produces a bare fragment with no AND/OR relator at all", () => {
  const filter = ruleToSceneFilter(
    rule({ conditions: [{ field: "tag", op: "any_of", value: ["t1"] }] }),
  );
  assert.deepEqual(Object.keys(filter), ["tags"]);
});

test("multiple conditions with AND logic nest via the AND relator, first condition's own field staying at the top level", () => {
  const r = rule({
    conditionLogic: "AND",
    conditions: [
      { field: "tag", op: "all_of", value: ["1", "2"] },
      { field: "rating", value: { min: 8, max: 10 } },
    ],
  });
  const filter = ruleToSceneFilter(r);
  assert.deepEqual(filter, {
    tags: { value: ["1", "2"], modifier: "INCLUDES_ALL", depth: 0 },
    AND: { rating100: { value: 80, value2: 100, modifier: "BETWEEN" } },
  });
});

test("multiple conditions with OR logic nest via the OR relator", () => {
  const r = rule({
    conditionLogic: "OR",
    conditions: [
      { field: "performer", op: "any_of", value: ["p1"] },
      { field: "performer", op: "any_of", value: ["p2"] },
    ],
  });
  const filter = ruleToSceneFilter(r);
  assert.deepEqual(filter, {
    performers: { value: ["p1"], modifier: "INCLUDES" },
    OR: { performers: { value: ["p2"], modifier: "INCLUDES" } },
  });
});

test("three AND conditions nest two levels deep, preserving each fragment's own field", () => {
  const r = rule({
    conditionLogic: "AND",
    conditions: [
      { field: "studio", op: "any_of", value: ["s1"] },
      { field: "tag", op: "any_of", value: ["t1"] },
      { field: "rating", value: { min: 5, max: null } },
    ],
  });
  const filter = ruleToSceneFilter(r);
  assert.deepEqual(filter, {
    studios: { value: ["s1"], modifier: "INCLUDES", depth: 0 },
    AND: {
      tags: { value: ["t1"], modifier: "INCLUDES", depth: 0 },
      AND: { rating100: { value: 50, value2: 100, modifier: "BETWEEN" } },
    },
  });
});

test("ruleToPreviewFilter AND-wraps onlyOrganized/onlyWithStashId gates around the rule's own (possibly OR-nested) filter", () => {
  const r = rule({
    conditionLogic: "OR",
    conditions: [
      { field: "tag", op: "any_of", value: ["t1"] },
      { field: "tag", op: "any_of", value: ["t2"] },
    ],
  });
  const filter = ruleToPreviewFilter(r, {
    onlyOrganized: true,
    onlyWithStashId: true,
  });
  assert.deepEqual(filter, {
    organized: true,
    AND: {
      stash_id_count: { value: 0, modifier: "GREATER_THAN" },
      AND: {
        tags: { value: ["t1"], modifier: "INCLUDES", depth: 0 },
        OR: { tags: { value: ["t2"], modifier: "INCLUDES", depth: 0 } },
      },
    },
  });
});

test("ruleToPreviewFilter returns the bare rule filter when both gates are off", () => {
  const r = rule({
    conditions: [{ field: "tag", op: "any_of", value: ["t1"] }],
  });
  const filter = ruleToPreviewFilter(r, {
    onlyOrganized: false,
    onlyWithStashId: false,
  });
  assert.deepEqual(filter, {
    tags: { value: ["t1"], modifier: "INCLUDES", depth: 0 },
  });
});

test("ruleToPreviewFilter returns null when the rule itself isn't translatable, regardless of gates", () => {
  const filter = ruleToPreviewFilter(rule({ conditions: [] }), {
    onlyOrganized: true,
  });
  assert.equal(filter, null);
});
