import test from "node:test";
import assert from "node:assert/strict";
import { ruleToSceneFilter } from "../../src/core/rule-to-filter.js";
import {
  evaluateCondition,
  describeCondition,
  matchRule,
} from "../../src/core/rule-engine.js";
import { normalizeConfig } from "../../src/core/config-schema.js";
import { normalizeScene } from "../../src/core/normalize-scene.js";

function rule(conditions) {
  return { conditionLogic: "AND", conditions: conditions };
}

function sceneIn(groups) {
  return normalizeScene(
    {
      id: "1",
      title: "Anita Goes Hard",
      groups: groups.map((g, i) => {
        return { scene_index: i + 1, group: { id: g.id, name: g.name } };
      }),
    },
    "scenes",
  );
}

const IN_A_GROUP = { field: "group", op: "not_null", value: [] };
const IN_NO_GROUP = { field: "group", op: "is_null", value: [] };

test("a group condition becomes an IS_NULL/NOT_NULL on groups", () => {
  assert.deepEqual(ruleToSceneFilter(rule([IN_A_GROUP])), {
    groups: { value: [], modifier: "NOT_NULL", depth: 0 },
  });
  assert.deepEqual(ruleToSceneFilter(rule([IN_NO_GROUP])), {
    groups: { value: [], modifier: "IS_NULL", depth: 0 },
  });
});

test("any other group op refuses to build a filter rather than guessing", () => {
  for (const op of ["any_of", "all_of", "equals"]) {
    assert.equal(
      ruleToSceneFilter(rule([{ field: "group", op: op, value: ["11"] }])),
      null,
      op + " should not translate to a groups filter",
    );
  }
});

test("the local evaluator agrees with the filter it stands in for", () => {
  const inGroup = sceneIn([{ id: "11", name: "Teen Dreams" }]);
  const loose = sceneIn([]);

  assert.equal(evaluateCondition(inGroup, IN_A_GROUP), true);
  assert.equal(evaluateCondition(inGroup, IN_NO_GROUP), false);
  assert.equal(evaluateCondition(loose, IN_A_GROUP), false);
  assert.equal(evaluateCondition(loose, IN_NO_GROUP), true);

  // and an op the filter refuses matches nothing rather than falling through
  // to some other meaning
  assert.equal(
    evaluateCondition(inGroup, { field: "group", op: "any_of", value: ["11"] }),
    false,
  );
});

test("a group rule is picked in order like any other", () => {
  const rules = [
    { id: "grouped", conditions: [IN_A_GROUP], conditionLogic: "AND" },
    { id: "loose", conditions: [IN_NO_GROUP], conditionLogic: "AND" },
  ];
  assert.equal(
    matchRule(sceneIn([{ id: "11", name: "T" }]), rules).id,
    "grouped",
  );
  assert.equal(matchRule(sceneIn([]), rules).id, "loose");
});

// The preview says why a scene matched, and for a group that is worth naming:
// it is the value {group} is about to write into the path
test("the match reason names the group", () => {
  assert.equal(
    describeCondition(sceneIn([{ id: "11", name: "Teen Dreams" }]), IN_A_GROUP),
    "belongs to 'Teen Dreams'",
  );
  assert.equal(
    describeCondition(
      sceneIn([
        { id: "11", name: "Teen Dreams" },
        { id: "12", name: "Later Compilation" },
      ]),
      IN_A_GROUP,
    ),
    "belongs to 'Teen Dreams', 'Later Compilation'",
  );
  assert.equal(
    describeCondition(sceneIn([]), IN_NO_GROUP),
    "belongs to no group",
  );
  // a group with no name still explains the match rather than quoting nothing
  assert.equal(
    describeCondition(sceneIn([{ id: "11", name: "" }]), IN_A_GROUP),
    "belongs to a group",
  );
});

test("group conditions are stripped from galleries and images", () => {
  const config = normalizeConfig({
    galleries: {
      rules: [
        {
          id: "g1",
          conditions: [
            IN_A_GROUP,
            { field: "tag", op: "any_of", value: ["t1"] },
          ],
        },
      ],
      excludeConditions: { conditionLogic: "OR", conditions: [IN_NO_GROUP] },
    },
    images: {
      rules: [{ id: "i1", conditions: [IN_A_GROUP] }],
    },
  });

  assert.deepEqual(config.galleries.rules[0].conditions, [
    { field: "tag", op: "any_of", value: ["t1"] },
  ]);
  assert.deepEqual(config.galleries.excludeConditions.conditions, []);
  assert.deepEqual(config.images.rules[0].conditions, []);
});

test("scene group conditions survive normalizing untouched", () => {
  const config = normalizeConfig({
    scenes: {
      rules: [{ id: "s1", conditions: [IN_A_GROUP] }],
      excludeConditions: { conditionLogic: "OR", conditions: [IN_NO_GROUP] },
    },
  });
  assert.deepEqual(config.scenes.rules[0].conditions, [IN_A_GROUP]);
  assert.deepEqual(config.scenes.excludeConditions.conditions, [IN_NO_GROUP]);
});
