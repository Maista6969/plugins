import test from "node:test";
import assert from "node:assert/strict";
import { pruneDeadLibraryRoots } from "../../src/core/prune-dead-library-roots.js";

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
    {
      rules: [],
      defaultPattern: {
        folderPattern: "",
        filenamePattern: "{title}",
        libraryRoot: "",
      },
    },
    overrides,
  );
}

test("returns the SAME config reference when every libraryRoot is still valid", () => {
  const cfg = config({
    rules: [rule({ libraryRoot: "/data/main" })],
    defaultPattern: {
      folderPattern: "",
      filenamePattern: "{title}",
      libraryRoot: "/data/main",
    },
  });
  const result = pruneDeadLibraryRoots(cfg, ["/data/main"]);
  assert.equal(result.config, cfg);
  assert.equal(result.disabledRules, 0);
  assert.equal(result.clearedDefault, false);
});

test("a rule whose libraryRoot is no longer among the valid paths is DISABLED, not deleted", () => {
  const cfg = config({
    rules: [
      rule({
        id: "keep-config",
        libraryRoot: "/mnt/drive/data",
        conditions: [{ field: "tag", op: "any_of", value: ["t1"] }],
        folderPattern: "{studio}",
        filenamePattern: "{title}",
      }),
    ],
  });
  const result = pruneDeadLibraryRoots(cfg, ["/data/main"]);
  assert.equal(result.disabledRules, 1);
  assert.equal(result.config.rules.length, 1);
  const disabled = result.config.rules[0];
  assert.equal(disabled.enabled, false);
  // everything else about the rule is untouched
  assert.equal(disabled.id, "keep-config");
  assert.deepEqual(disabled.conditions, [
    { field: "tag", op: "any_of", value: ["t1"] },
  ]);
  assert.equal(disabled.folderPattern, "{studio}");
  assert.equal(disabled.filenamePattern, "{title}");
  assert.equal(disabled.libraryRoot, "/mnt/drive/data");
});

test("a rule already disabled with a dead libraryRoot is left alone (nothing new to report)", () => {
  const cfg = config({
    rules: [rule({ enabled: false, libraryRoot: "/mnt/drive/data" })],
  });
  const result = pruneDeadLibraryRoots(cfg, ["/data/main"]);
  assert.equal(result.config, cfg);
  assert.equal(result.disabledRules, 0);
});

test("a rule with NO libraryRoot set at all is left alone — that's a rule still being configured, not one broken by deletion", () => {
  const cfg = config({ rules: [rule({ libraryRoot: "" })] });
  const result = pruneDeadLibraryRoots(cfg, ["/data/main"]);
  assert.equal(result.config, cfg);
  assert.equal(result.disabledRules, 0);
});

test("the default pattern's dead libraryRoot is CLEARED, not disabled (it has no enabled flag)", () => {
  const cfg = config({
    defaultPattern: {
      folderPattern: "",
      filenamePattern: "{title}",
      sortBy: "alphabetical",
      libraryRoot: "/mnt/drive/data",
    },
  });
  const result = pruneDeadLibraryRoots(cfg, ["/data/main"]);
  assert.equal(result.clearedDefault, true);
  assert.equal(result.config.defaultPattern.libraryRoot, "");
  // sortBy and everything else about defaultPattern is untouched
  assert.equal(result.config.defaultPattern.sortBy, "alphabetical");
});

test("multiple rules and the default pattern can all be pruned in one pass", () => {
  const cfg = config({
    rules: [
      rule({ id: "r1", libraryRoot: "/mnt/drive/data" }),
      rule({ id: "r2", libraryRoot: "/data/main" }),
      rule({ id: "r3", libraryRoot: "/also/gone" }),
    ],
    defaultPattern: {
      folderPattern: "",
      filenamePattern: "{title}",
      libraryRoot: "/mnt/drive/data",
    },
  });
  const result = pruneDeadLibraryRoots(cfg, ["/data/main"]);
  assert.equal(result.disabledRules, 2);
  assert.equal(result.clearedDefault, true);
  assert.equal(result.config.rules[0].enabled, false);
  assert.equal(result.config.rules[1].enabled, true);
  assert.equal(result.config.rules[2].enabled, false);
});

test("an empty validPaths list (Stash genuinely has zero libraries configured) disables every rule with a set libraryRoot", () => {
  const cfg = config({ rules: [rule({ libraryRoot: "/data/main" })] });
  const result = pruneDeadLibraryRoots(cfg, []);
  assert.equal(result.disabledRules, 1);
  assert.equal(result.config.rules[0].enabled, false);
});
