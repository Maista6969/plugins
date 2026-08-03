import test from "node:test";
import assert from "node:assert/strict";
import {
  matchRule,
  getMatchedEntityIds,
  evaluateConditions,
  matchingConditions,
  describeCondition,
} from "../../src/core/rule-engine.js";

function sceneView(overrides) {
  return Object.assign(
    {
      title: "My Scene",
      studioNames: ["Root", "Parent", "Leaf"],
      studioIds: ["studio-root", "studio-parent", "studio-leaf"],
      performerNames: ["Amy", "Zed"],
      performerIds: ["perf-amy", "perf-zed"],
      tagNames: ["Rock", "Pop"],
      tagIds: ["tag-rock", "tag-pop"],
    },
    overrides,
  );
}

test("returns null when rules is empty", () => {
  assert.equal(matchRule(sceneView(), []), null);
});

test("first-match-wins: earlier matching rule wins over a later one that would also match", () => {
  const first = {
    conditions: [{ field: "tag", op: "any_of", value: ["tag-rock"] }],
    folderPattern: "",
    filenamePattern: "A",
  };
  const second = {
    conditions: [{ field: "tag", op: "any_of", value: ["tag-pop"] }],
    folderPattern: "",
    filenamePattern: "B",
  };
  assert.equal(matchRule(sceneView(), [first, second]), first);
  assert.equal(matchRule(sceneView(), [second, first]), second);
});

test("disabled rules are skipped even if they'd otherwise match", () => {
  const disabled = {
    enabled: false,
    conditions: [{ field: "tag", op: "any_of", value: ["tag-rock"] }],
    folderPattern: "",
    filenamePattern: "A",
  };
  const fallbackMatch = {
    conditions: [{ field: "tag", op: "any_of", value: ["tag-pop"] }],
    folderPattern: "",
    filenamePattern: "B",
  };
  assert.equal(
    matchRule(sceneView(), [disabled, fallbackMatch]),
    fallbackMatch,
  );
});

test("a rule with zero conditions never matches (guards against accidental catch-all)", () => {
  const empty = { conditions: [], folderPattern: "", filenamePattern: "A" };
  assert.equal(matchRule(sceneView(), [empty]), null);
});

test("AND logic requires every condition to hold", () => {
  const rule = {
    conditionLogic: "AND",
    conditions: [
      { field: "tag", op: "any_of", value: ["tag-rock"] },
      { field: "performer", op: "any_of", value: ["perf-amy"] },
    ],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(sceneView(), [rule]), rule);

  const failing = {
    conditionLogic: "AND",
    conditions: [
      { field: "tag", op: "any_of", value: ["tag-rock"] },
      { field: "performer", op: "any_of", value: ["perf-nobody"] },
    ],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(sceneView(), [failing]), null);
});

test("OR logic requires only one condition to hold", () => {
  const rule = {
    conditionLogic: "OR",
    conditions: [
      { field: "tag", op: "any_of", value: ["tag-nonexistent"] },
      { field: "performer", op: "any_of", value: ["perf-amy"] },
    ],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(sceneView(), [rule]), rule);
});

test("performer/tag all_of requires every selected id to be present, not just one", () => {
  const bothPresent = {
    conditions: [
      { field: "tag", op: "all_of", value: ["tag-rock", "tag-pop"] },
    ],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(sceneView(), [bothPresent]), bothPresent);

  const onlyOnePresent = {
    conditions: [
      { field: "tag", op: "all_of", value: ["tag-rock", "tag-nonexistent"] },
    ],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(sceneView(), [onlyOnePresent]), null);

  const anyOfEquivalent = {
    conditions: [
      { field: "tag", op: "any_of", value: ["tag-rock", "tag-nonexistent"] },
    ],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(sceneView(), [anyOfEquivalent]), anyOfEquivalent);
});

test("all_of with an empty selection never matches", () => {
  const rule = {
    conditions: [{ field: "performer", op: "all_of", value: [] }],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(sceneView(), [rule]), null);
});

test("is_null matches a scene with none of the field set, and never matches one that has it, regardless of `value`", () => {
  // has a full studio chain, performers, tags
  const withStudio = sceneView();
  const noStudio = sceneView({ studioNames: [], studioIds: [] });
  const noPerformers = sceneView({ performerNames: [], performerIds: [] });
  const noTags = sceneView({ tagNames: [], tagIds: [] });

  const studioIsNull = {
    conditions: [{ field: "studio", op: "is_null", value: [] }],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(withStudio, [studioIsNull]), null);
  assert.equal(matchRule(noStudio, [studioIsNull]), studioIsNull);

  const performerIsNull = {
    conditions: [{ field: "performer", op: "is_null", value: ["perf-amy"] }], // value ignored
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(withStudio, [performerIsNull]), null);
  assert.equal(matchRule(noPerformers, [performerIsNull]), performerIsNull);

  const tagIsNull = {
    conditions: [{ field: "tag", op: "is_null", value: [] }],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(withStudio, [tagIsNull]), null);
  assert.equal(matchRule(noTags, [tagIsNull]), tagIsNull);
});

test("not_null matches a scene that has at least one of the field set, regardless of which, and never one with none", () => {
  const withPerformers = sceneView();
  const noPerformers = sceneView({ performerNames: [], performerIds: [] });
  const noStudio = sceneView({ studioNames: [], studioIds: [] });

  const performerNotNull = {
    conditions: [{ field: "performer", op: "not_null", value: [] }], // value ignored
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(withPerformers, [performerNotNull]), performerNotNull);
  assert.equal(matchRule(noPerformers, [performerNotNull]), null);

  const studioNotNull = {
    conditions: [{ field: "studio", op: "not_null", value: [] }],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(withPerformers, [studioNotNull]), studioNotNull);
  assert.equal(matchRule(noStudio, [studioNotNull]), null);
});

test("there is no 'title' rule condition field", () => {
  const rule = {
    conditions: [{ field: "title", op: "contains", value: "My" }],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(sceneView(), [rule]), null);
});

test("rating condition matches within an inclusive min/max range on the 0-10 scale", () => {
  const view = sceneView({ rating100: 85 });
  const withinRange = {
    conditions: [{ field: "rating", value: { min: 8, max: 10 } }],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(view, [withinRange]), withinRange);

  const outsideRange = {
    conditions: [{ field: "rating", value: { min: 9, max: 10 } }],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(view, [outsideRange]), null);

  // Exact boundary values are inclusive.
  const exactMin = {
    conditions: [{ field: "rating", value: { min: 8.5, max: null } }],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(view, [exactMin]), exactMin);
  const exactMax = {
    conditions: [{ field: "rating", value: { min: null, max: 8.5 } }],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(view, [exactMax]), exactMax);
});

test("rating condition never matches an unrated scene, even an unbounded range", () => {
  const view = sceneView({ rating100: null });
  const rule = {
    conditions: [{ field: "rating", value: { min: 0, max: 10 } }],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(view, [rule]), null);
});

test("rating condition with both bounds null never matches (nothing to check against)", () => {
  const view = sceneView({ rating100: 50 });
  const rule = {
    conditions: [{ field: "rating", value: { min: null, max: null } }],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(view, [rule]), null);
});

test("getMatchedEntityIds returns only the scene's own performer ids that satisfied a performer condition, not the whole selection", () => {
  // performerIds: ["perf-amy", "perf-zed"]
  const view = sceneView();
  const rule = {
    conditions: [
      {
        field: "performer",
        op: "any_of",
        value: ["perf-zed", "perf-someone-else"],
      },
    ],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.deepEqual(getMatchedEntityIds(view, rule, "performer"), ["perf-zed"]);
});

test("getMatchedEntityIds ignores conditions for a different field, and OR-logic conditions that didn't individually match", () => {
  const view = sceneView();
  const rule = {
    conditionLogic: "OR",
    conditions: [
      { field: "tag", op: "any_of", value: ["tag-nonexistent"] },
      { field: "performer", op: "any_of", value: ["perf-amy"] },
    ],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.deepEqual(getMatchedEntityIds(view, rule, "performer"), ["perf-amy"]);
  assert.deepEqual(getMatchedEntityIds(view, rule, "tag"), []);
});

test("path condition matches if ANY of the scene's files' paths satisfies the criterion, op carrying the modifier directly", () => {
  const view = sceneView({
    files: [{ path: "/data/OldStuff/a.mp4" }, { path: "/data/B/b.mp4" }],
  });
  const includes = {
    conditions: [{ field: "path", op: "INCLUDES", value: "oldstuff" }],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(view, [includes]), includes);

  const noMatch = {
    conditions: [{ field: "path", op: "INCLUDES", value: "nonexistent" }],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(view, [noMatch]), null);

  const regex = {
    conditions: [{ field: "path", op: "MATCHES_REGEX", value: "^/data/B/" }],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(view, [regex]), regex);
});

test("path condition never matches a scene with no files", () => {
  const view = sceneView({ files: [] });
  const rule = {
    conditions: [{ field: "path", op: "INCLUDES", value: "anything" }],
    folderPattern: "",
    filenamePattern: "A",
  };
  assert.equal(matchRule(view, [rule]), null);
});

test("evaluateConditions: zero conditions never matches, mirroring matchRule's own guard", () => {
  assert.equal(evaluateConditions(sceneView(), "OR", []), false);
  assert.equal(evaluateConditions(sceneView(), "OR", undefined), false);
});

test("evaluateConditions: OR across mixed field types matches if ANY condition holds", () => {
  const view = sceneView();
  const result = evaluateConditions(view, "OR", [
    { field: "tag", op: "any_of", value: ["tag-nonexistent"] },
    { field: "performer", op: "any_of", value: ["perf-amy"] },
  ]);
  assert.equal(result, true);
});

test("evaluateConditions: AND across mixed field types requires every condition to hold", () => {
  const view = sceneView();
  const allMatch = evaluateConditions(view, "AND", [
    { field: "tag", op: "any_of", value: ["tag-rock"] },
    { field: "performer", op: "any_of", value: ["perf-amy"] },
  ]);
  assert.equal(allMatch, true);

  const oneFails = evaluateConditions(view, "AND", [
    { field: "tag", op: "any_of", value: ["tag-rock"] },
    { field: "performer", op: "any_of", value: ["perf-nobody"] },
  ]);
  assert.equal(oneFails, false);
});

test("matchingConditions: zero conditions never matches, mirroring evaluateConditions' own guard", () => {
  assert.deepEqual(matchingConditions(sceneView(), "OR", []), []);
  assert.deepEqual(matchingConditions(sceneView(), "OR", undefined), []);
});

test("matchingConditions: AND logic returns EVERY condition when they all match (all of them had to, for the block to match at all)", () => {
  const view = sceneView();
  const conditions = [
    { field: "tag", op: "any_of", value: ["tag-rock"] },
    { field: "performer", op: "any_of", value: ["perf-amy"] },
  ];
  assert.deepEqual(matchingConditions(view, "AND", conditions), conditions);
});

test("matchingConditions: AND logic returns [] when even one condition fails (no partial list)", () => {
  const view = sceneView();
  const conditions = [
    { field: "tag", op: "any_of", value: ["tag-rock"] },
    { field: "performer", op: "any_of", value: ["perf-nobody"] },
  ];
  assert.deepEqual(matchingConditions(view, "AND", conditions), []);
});

test("matchingConditions: OR logic returns ONLY the subset that actually matched, not every configured condition", () => {
  const view = sceneView();
  const matching = { field: "performer", op: "any_of", value: ["perf-amy"] };
  const nonMatching = {
    field: "tag",
    op: "any_of",
    value: ["tag-nonexistent"],
  };
  assert.deepEqual(matchingConditions(view, "OR", [nonMatching, matching]), [
    matching,
  ]);
});

test("matchingConditions: OR logic returns every condition that independently matched when more than one does", () => {
  const view = sceneView();
  const conditions = [
    { field: "tag", op: "any_of", value: ["tag-rock"] },
    { field: "performer", op: "any_of", value: ["perf-amy"] },
  ];
  assert.deepEqual(matchingConditions(view, "OR", conditions), conditions);
});

test("matchingConditions: OR logic returns [] when nothing matches at all", () => {
  const view = sceneView();
  assert.deepEqual(
    matchingConditions(view, "OR", [
      { field: "tag", op: "any_of", value: ["tag-nonexistent"] },
    ]),
    [],
  );
});

test("describeCondition: studio resolves to the scene's own studio name for whichever id in the condition actually overlaps", () => {
  const view = sceneView();
  assert.equal(
    describeCondition(view, {
      field: "studio",
      op: "any_of",
      value: ["studio-leaf"],
    }),
    "studio is 'Leaf'",
  );
});

test("describeCondition: is_null/not_null describe plainly, not '(unknown)' or an arbitrary attributed name", () => {
  const view = sceneView();
  assert.equal(
    describeCondition(view, { field: "studio", op: "is_null", value: [] }),
    "studio is not set",
  );
  assert.equal(
    describeCondition(view, { field: "performer", op: "is_null", value: [] }),
    "performer is not set",
  );
  assert.equal(
    describeCondition(view, { field: "tag", op: "not_null", value: [] }),
    "tag is set",
  );
});

test("describeCondition: performer/tag resolve to the OVERLAPPING name(s) only, not every configured id", () => {
  const view = sceneView();
  assert.equal(
    describeCondition(view, {
      field: "performer",
      op: "any_of",
      value: ["perf-amy", "perf-nonexistent"],
    }),
    "performer is 'Amy'",
  );
  assert.equal(
    describeCondition(view, {
      field: "tag",
      op: "all_of",
      value: ["tag-rock", "tag-pop"],
    }),
    "tag is 'Rock', 'Pop'",
  );
});

test("describeCondition: rating describes whichever bound(s) are actually set", () => {
  const view = sceneView();
  assert.equal(
    describeCondition(view, { field: "rating", value: { min: 8, max: 10 } }),
    "rating is between 8 and 10",
  );
  assert.equal(
    describeCondition(view, { field: "rating", value: { min: 8, max: null } }),
    "rating is at least 8",
  );
  assert.equal(
    describeCondition(view, { field: "rating", value: { min: null, max: 3 } }),
    "rating is at most 3",
  );
});

test("describeCondition: path describes the modifier in plain words, not the raw CriterionModifier constant", () => {
  const view = sceneView();
  assert.equal(
    describeCondition(view, { field: "path", op: "INCLUDES", value: "/old/" }),
    "path contains '/old/'",
  );
  assert.equal(
    describeCondition(view, {
      field: "path",
      op: "NOT_MATCHES_REGEX",
      value: "^/keep/",
    }),
    "path doesn't match regex '^/keep/'",
  );
});

test("getMatchedEntityIds returns [] for a null rule (default-pattern case)", () => {
  assert.deepEqual(getMatchedEntityIds(sceneView(), null, "performer"), []);
});
