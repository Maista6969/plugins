import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateCondition,
  describeCondition,
  matchRule,
} from "../../src/core/rule-engine.js";
import {
  ruleToSceneFilter,
  stashIdConditionIsApproximate,
} from "../../src/core/rule-to-filter.js";
import { normalizeScene } from "../../src/core/normalize-scene.js";
import { planScene, configNeedsStashBoxes } from "../../src/core/plan-scene.js";
import { normalizeConfig } from "../../src/core/config-schema.js";

const STASHDB = "https://stashdb.org/graphql";
const TPDB = "https://theporndb.net/graphql";
const FANSDB = "https://fansdb.cc/graphql";

const BOXES = [
  { endpoint: STASHDB, name: "StashDB" },
  { endpoint: TPDB, name: "ThePornDB" },
  { endpoint: FANSDB, name: "FansDB" },
];

function sceneWith(endpoints) {
  return normalizeScene({
    id: "s",
    stash_ids: endpoints.map((endpoint, i) => {
      return { endpoint: endpoint, stash_id: "id-" + i };
    }),
  });
}

const has = (endpoints) => {
  return { field: "stash_id", op: "not_null", value: endpoints };
};
const hasNo = (endpoints) => {
  return { field: "stash_id", op: "is_null", value: endpoints };
};

test("has a StashID with no source picked matches a StashID from any source", () => {
  assert.equal(evaluateCondition(sceneWith([FANSDB]), has([])), true);
  assert.equal(evaluateCondition(sceneWith([]), has([])), false);
});

test("has a StashID from several sources matches when the scene has any one of them", () => {
  const condition = has([STASHDB, TPDB]);
  assert.equal(evaluateCondition(sceneWith([TPDB]), condition), true);
  assert.equal(evaluateCondition(sceneWith([STASHDB, TPDB]), condition), true);
  assert.equal(evaluateCondition(sceneWith([FANSDB]), condition), false);
  assert.equal(evaluateCondition(sceneWith([]), condition), false);
});

test("has no StashID is the exact opposite of has, source by source", () => {
  const scenes = [[], [STASHDB], [FANSDB], [STASHDB, TPDB]];
  [[], [STASHDB], [STASHDB, TPDB]].forEach((endpoints) => {
    scenes.forEach((held) => {
      const scene = sceneWith(held);
      assert.equal(
        evaluateCondition(scene, hasNo(endpoints)),
        !evaluateCondition(scene, has(endpoints)),
        "has no " + endpoints.join("+") + " on a scene with " + held.join("+"),
      );
    });
  });
});

test("blank endpoints left behind in the list are ignored rather than matching nothing", () => {
  assert.equal(evaluateCondition(sceneWith([FANSDB]), has([""])), true);
});

test("a rule routes matched and unmatched scenes apart with has/has no", () => {
  const rules = [
    { id: "matched", conditionLogic: "AND", conditions: [has([STASHDB])] },
    { id: "unmatched", conditionLogic: "AND", conditions: [hasNo([STASHDB])] },
  ];
  assert.equal(matchRule(sceneWith([STASHDB]), rules).id, "matched");
  assert.equal(matchRule(sceneWith([TPDB]), rules).id, "unmatched");
});

test("describeCondition names the sources by their Stash names, falling back to the endpoint", () => {
  const scene = sceneWith([TPDB, FANSDB]);
  assert.equal(
    describeCondition(scene, has([STASHDB, TPDB]), BOXES),
    "has a StashID from ThePornDB",
  );
  assert.equal(
    describeCondition(scene, has([]), BOXES),
    "has a StashID from ThePornDB, FansDB",
  );
  assert.equal(
    describeCondition(sceneWith([]), hasNo([STASHDB, TPDB]), BOXES),
    "has no StashID from StashDB or ThePornDB",
  );
  assert.equal(
    describeCondition(sceneWith([]), hasNo([]), BOXES),
    "has no StashID",
  );
  assert.equal(
    describeCondition(sceneWith([]), hasNo([STASHDB]), null),
    "has no StashID from " + STASHDB,
  );
});

test("one source or none translates to an exact Stash filter", () => {
  assert.deepEqual(ruleToSceneFilter({ conditions: [has([])] }), {
    stash_id_count: { value: 0, modifier: "GREATER_THAN" },
  });
  assert.deepEqual(ruleToSceneFilter({ conditions: [has([STASHDB])] }), {
    stash_ids_endpoint: { endpoint: STASHDB, modifier: "NOT_NULL" },
  });
  assert.deepEqual(ruleToSceneFilter({ conditions: [hasNo([])] }), {
    stash_id_count: { value: 0, modifier: "EQUALS" },
  });
  assert.deepEqual(ruleToSceneFilter({ conditions: [hasNo([STASHDB])] }), {
    stash_ids_endpoint: { endpoint: STASHDB, modifier: "IS_NULL" },
  });
  assert.equal(
    stashIdConditionIsApproximate({ conditions: [has([STASHDB])] }),
    false,
  );
});

test("several sources over-select rather than under-select, and say so", () => {
  // any StashID at all is a superset of a StashID from one of these
  assert.deepEqual(ruleToSceneFilter({ conditions: [has([STASHDB, TPDB])] }), {
    stash_id_count: { value: 0, modifier: "GREATER_THAN" },
  });
  // lacking the first source is a superset of lacking all of them
  assert.deepEqual(
    ruleToSceneFilter({ conditions: [hasNo([STASHDB, TPDB])] }),
    { stash_ids_endpoint: { endpoint: STASHDB, modifier: "IS_NULL" } },
  );
  assert.equal(
    stashIdConditionIsApproximate({ conditions: [hasNo([STASHDB, TPDB])] }),
    true,
  );
});

test("an exclusion on StashID sources names them in the skip reason, and fetches the names to do so", () => {
  const config = normalizeConfig({
    scenes: {
      onlyOrganized: false,
      excludeConditions: {
        conditionLogic: "OR",
        conditions: [hasNo([STASHDB])],
      },
      defaultPattern: { libraryRoot: "/data", filenamePattern: "{title}" },
    },
  });
  assert.equal(configNeedsStashBoxes(config, "scenes"), true);
  const result = planScene(
    {
      id: "1",
      title: "Unmatched",
      files: [{ id: "1", path: "/data/old/a.mp4" }],
      stash_ids: [{ endpoint: TPDB, stash_id: "x" }],
    },
    config,
    BOXES,
  );
  assert.equal(result.status, "skipped");
  assert.deepEqual(result.excludedBy, ["has no StashID from StashDB"]);
});

test("an exclusion on any StashID needs no source names, so fetches none", () => {
  const config = normalizeConfig({
    scenes: {
      excludeConditions: { conditionLogic: "OR", conditions: [hasNo([])] },
      defaultPattern: { libraryRoot: "/data", filenamePattern: "{title}" },
    },
  });
  assert.equal(configNeedsStashBoxes(config, "scenes"), false);
});

test("StashID conditions are stripped from galleries and images, which have no StashIDs", () => {
  const config = normalizeConfig({
    galleries: {
      rules: [{ id: "g1", conditions: [has([]), hasNo([STASHDB])] }],
      excludeConditions: { conditionLogic: "OR", conditions: [hasNo([])] },
    },
    images: { rules: [{ id: "i1", conditions: [has([STASHDB])] }] },
    scenes: { rules: [{ id: "s1", conditions: [has([STASHDB])] }] },
  });
  assert.deepEqual(config.galleries.rules[0].conditions, []);
  assert.deepEqual(config.galleries.excludeConditions.conditions, []);
  assert.deepEqual(config.images.rules[0].conditions, []);
  assert.deepEqual(config.scenes.rules[0].conditions, [has([STASHDB])]);
});
