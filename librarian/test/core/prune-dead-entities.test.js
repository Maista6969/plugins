import test from "node:test";
import assert from "node:assert/strict";
import {
  collectEntityIds,
  pruneDeadEntities,
} from "../../src/core/prune-dead-entities.js";

function rule(overrides) {
  return Object.assign(
    {
      id: "r1",
      enabled: true,
      conditionLogic: "AND",
      conditions: [],
      folderPattern: "",
      filenamePattern: "{title}",
    },
    overrides,
  );
}

function config(overrides) {
  return Object.assign(
    { rules: [], excludeConditions: { conditionLogic: "OR", conditions: [] } },
    overrides,
  );
}

function noDeadIds() {
  return { performer: new Set(), tag: new Set(), studio: new Set() };
}

test("collectEntityIds gathers performer/tag/studio ids from rules and excludeConditions, ignoring rating/path", () => {
  const cfg = config({
    rules: [
      rule({
        conditions: [
          { field: "performer", op: "any_of", value: ["p1", "p2"] },
          { field: "tag", op: "all_of", value: ["t1"] },
          { field: "rating", op: "any_of", value: { min: 1, max: 5 } },
        ],
      }),
      rule({
        id: "r2",
        conditions: [{ field: "studio", op: "any_of", value: ["s1"] }],
      }),
    ],
    excludeConditions: {
      conditionLogic: "OR",
      conditions: [
        { field: "path", op: "INCLUDES", value: "/x" },
        { field: "studio", op: "any_of", value: ["s2"] },
      ],
    },
  });

  const ids = collectEntityIds(cfg);
  assert.deepEqual([...ids.performer].sort(), ["p1", "p2"]);
  assert.deepEqual([...ids.tag].sort(), ["t1"]);
  assert.deepEqual([...ids.studio].sort(), ["s1", "s2"]);
});

test("pruneDeadEntities returns the SAME config reference when nothing is dead", () => {
  const cfg = config({
    rules: [
      rule({
        conditions: [{ field: "performer", op: "any_of", value: ["p1"] }],
      }),
    ],
  });
  const result = pruneDeadEntities(cfg, noDeadIds());
  assert.equal(result.config, cfg);
  assert.equal(result.removedReferences, 0);
  assert.equal(result.removedRules, 0);
});

test("a dead id is filtered out of a condition's value while the condition survives (other ids remain)", () => {
  const cfg = config({
    rules: [
      rule({
        conditions: [
          { field: "performer", op: "any_of", value: ["p1", "p2", "p3"] },
        ],
      }),
    ],
  });
  const result = pruneDeadEntities(cfg, {
    performer: new Set(["p2"]),
    tag: new Set(),
    studio: new Set(),
  });
  assert.notEqual(result.config, cfg);
  assert.equal(result.removedReferences, 1);
  assert.equal(result.removedRules, 0);
  assert.deepEqual(result.config.rules[0].conditions, [
    { field: "performer", op: "any_of", value: ["p1", "p3"] },
  ]);
  // original untouched
  assert.deepEqual(cfg.rules[0].conditions[0].value, ["p1", "p2", "p3"]);
});

test("a condition whose every id is dead is removed entirely, but the rule survives if another condition remains", () => {
  const cfg = config({
    rules: [
      rule({
        conditionLogic: "AND",
        conditions: [
          { field: "performer", op: "any_of", value: ["p1"] },
          { field: "tag", op: "any_of", value: ["t1", "t2"] },
        ],
      }),
    ],
  });
  const result = pruneDeadEntities(cfg, {
    performer: new Set(["p1"]),
    tag: new Set(),
    studio: new Set(),
  });
  assert.equal(result.removedRules, 0);
  assert.equal(result.config.rules.length, 1);
  assert.deepEqual(result.config.rules[0].conditions, [
    { field: "tag", op: "any_of", value: ["t1", "t2"] },
  ]);
});

test("a rule left with zero conditions after pruning is removed entirely", () => {
  const cfg = config({
    rules: [
      rule({
        id: "keep-me",
        conditions: [{ field: "tag", op: "any_of", value: ["t1"] }],
      }),
      rule({
        id: "drop-me",
        conditions: [{ field: "performer", op: "any_of", value: ["p1"] }],
      }),
    ],
  });
  const result = pruneDeadEntities(cfg, {
    performer: new Set(["p1"]),
    tag: new Set(),
    studio: new Set(),
  });
  assert.equal(result.removedRules, 1);
  assert.equal(result.config.rules.length, 1);
  assert.equal(result.config.rules[0].id, "keep-me");
});

test("a rule that was ALREADY empty (no conditions) before pruning is left alone, not counted as removed", () => {
  const cfg = config({ rules: [rule({ id: "blank", conditions: [] })] });
  const result = pruneDeadEntities(cfg, {
    performer: new Set(["p1"]),
    tag: new Set(),
    studio: new Set(),
  });
  assert.equal(result.config, cfg);
  assert.equal(result.removedRules, 0);
  assert.equal(result.config.rules.length, 1);
});

test("excludeConditions is pruned the same way but is never itself deleted, even down to zero conditions", () => {
  const cfg = config({
    excludeConditions: {
      conditionLogic: "OR",
      conditions: [{ field: "performer", op: "any_of", value: ["p1"] }],
    },
  });
  const result = pruneDeadEntities(cfg, {
    performer: new Set(["p1"]),
    tag: new Set(),
    studio: new Set(),
  });
  assert.equal(result.removedReferences, 1);
  assert.equal(result.removedRules, 0);
  assert.deepEqual(result.config.excludeConditions, {
    conditionLogic: "OR",
    conditions: [],
  });
});

test("rating and path conditions are never touched, regardless of deadIds", () => {
  const cfg = config({
    rules: [
      rule({
        conditions: [
          { field: "rating", op: "any_of", value: { min: 1, max: 5 } },
          { field: "path", op: "INCLUDES", value: "/data" },
        ],
      }),
    ],
  });
  const result = pruneDeadEntities(cfg, {
    performer: new Set(["anything"]),
    tag: new Set(["anything"]),
    studio: new Set(["anything"]),
  });
  assert.equal(result.config, cfg);
});

test("a disabled rule is pruned/removed the same as an enabled one", () => {
  const cfg = config({
    rules: [
      rule({
        enabled: false,
        conditions: [{ field: "performer", op: "any_of", value: ["p1"] }],
      }),
    ],
  });
  const result = pruneDeadEntities(cfg, {
    performer: new Set(["p1"]),
    tag: new Set(),
    studio: new Set(),
  });
  assert.equal(result.removedRules, 1);
  assert.equal(result.config.rules.length, 0);
});

test("a rule with an untouched condition alongside a fully-pruned one loses only the dead condition", () => {
  const cfg = config({
    rules: [
      rule({
        conditions: [
          { field: "tag", op: "any_of", value: ["t1"] },
          { field: "performer", op: "any_of", value: ["p1", "p2"] },
        ],
      }),
    ],
  });
  const result = pruneDeadEntities(cfg, {
    performer: new Set(["p1", "p2"]),
    tag: new Set(),
    studio: new Set(),
  });
  assert.equal(result.config.rules.length, 1);
  assert.deepEqual(result.config.rules[0].conditions, [
    { field: "tag", op: "any_of", value: ["t1"] },
  ]);
});
