import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeConfig,
  DEFAULT_CONFIG,
  resetSection,
  resetFormatting,
  availableEntityTypes,
  resolveActiveType,
} from "../../src/core/config-schema.js";

test("a fresh config (no raw at all) returns DEFAULT_CONFIG's own shape", () => {
  assert.deepEqual(normalizeConfig(undefined), DEFAULT_CONFIG);
});

test("raw values override the matching default, field by field", () => {
  const config = normalizeConfig({
    onlyOrganized: false,
    rules: [{ id: "r1" }],
  });
  assert.equal(config.scenes.onlyOrganized, false);
  assert.deepEqual(config.scenes.rules, [{ id: "r1" }]);
  // Untouched fields still fall back to their own default.
  assert.equal(config.scenes.onlyWithStashId, false);
  assert.equal(config.scenes.autoRename, true);
});

test("a partially-specified nested object (defaultPattern) is merged field by field, not replaced wholesale", () => {
  const config = normalizeConfig({
    defaultPattern: { libraryRoot: "/data/main" },
  });
  assert.equal(config.scenes.defaultPattern.libraryRoot, "/data/main");
  assert.equal(
    config.scenes.defaultPattern.folderPattern,
    DEFAULT_CONFIG.scenes.defaultPattern.folderPattern,
  );
  assert.deepEqual(config.scenes.defaultPattern.sortBy, ["name"]);
});

// mergeDefaults replaces a non-array with an array default, so without the
// migration running first every stored legacy sortBy would silently revert
test("a legacy sortBy string migrates to criteria rather than reverting to the default", () => {
  const config = normalizeConfig({
    scenes: { defaultPattern: { sortBy: "favorite_first" } },
  });
  assert.deepEqual(config.scenes.defaultPattern.sortBy, ["favorite", "name"]);
});

test("legacy sortBy migrates on defaultPattern and inside rules, for every entity type", () => {
  const config = normalizeConfig({
    scenes: {
      defaultPattern: { sortBy: "rating" },
      rules: [
        { id: "r1", sortBy: "favorite_first" },
        { id: "r2", sortBy: "alphabetical" },
        { id: "r3" },
      ],
    },
    galleries: { defaultPattern: { sortBy: "favorite_first" } },
    images: { rules: [{ id: "i1", sortBy: "rating" }] },
  });
  assert.deepEqual(config.scenes.defaultPattern.sortBy, ["rating", "name"]);
  assert.deepEqual(config.scenes.rules[0].sortBy, ["favorite", "name"]);
  assert.deepEqual(config.scenes.rules[1].sortBy, ["name"]);
  // a rule that never set one is left alone rather than gaining a field
  assert.equal(config.scenes.rules[2].sortBy, undefined);
  assert.deepEqual(config.galleries.defaultPattern.sortBy, [
    "favorite",
    "name",
  ]);
  assert.deepEqual(config.images.rules[0].sortBy, ["rating", "name"]);
});

test("sortBy migration is idempotent and degrades an unknown value safely", () => {
  const once = normalizeConfig({
    scenes: { defaultPattern: { sortBy: "favorite_first" } },
  });
  assert.deepEqual(normalizeConfig(once), once);
  const bogus = normalizeConfig({
    scenes: { defaultPattern: { sortBy: "nonsense" } },
  });
  assert.deepEqual(bogus.scenes.defaultPattern.sortBy, ["name"]);
});

test("a pre-sections legacy config gets its sortBy migrated too, after being hoisted", () => {
  const config = normalizeConfig({
    defaultPattern: { sortBy: "favorite_first" },
    rules: [{ id: "r1", sortBy: "rating" }],
  });
  assert.deepEqual(config.scenes.defaultPattern.sortBy, ["favorite", "name"]);
  assert.deepEqual(config.scenes.rules[0].sortBy, ["rating", "name"]);
});

test("a non-object raw value (null, a string, a number) is treated the same as no config at all", () => {
  assert.deepEqual(normalizeConfig(null), DEFAULT_CONFIG);
  assert.deepEqual(normalizeConfig("nonsense"), DEFAULT_CONFIG);
  assert.deepEqual(normalizeConfig(42), DEFAULT_CONFIG);
});

test("normalizeConfig is idempotent: re-normalizing an already-normalized config changes nothing", () => {
  const once = normalizeConfig({ onlyOrganized: false, rules: [{ id: "r1" }] });
  const twice = normalizeConfig(once);
  assert.deepEqual(twice, once);
});

test("a pre-sections config has its scene-only top-level keys migrated under config.scenes", () => {
  const legacy = {
    autoRename: false,
    onlyOrganized: false,
    onlyWithStashId: true,
    rules: [{ id: "r1" }],
    excludeConditions: {
      conditionLogic: "AND",
      conditions: [{ field: "tag" }],
    },
    defaultPattern: { folderPattern: "{studio}", libraryRoot: "/data" },
  };
  const config = normalizeConfig(legacy);

  assert.equal(config.scenes.autoRename, false);
  assert.equal(config.scenes.onlyOrganized, false);
  assert.equal(config.scenes.onlyWithStashId, true);
  assert.deepEqual(config.scenes.rules, [{ id: "r1" }]);
  assert.equal(config.scenes.excludeConditions.conditionLogic, "AND");
  assert.equal(config.scenes.defaultPattern.libraryRoot, "/data");

  // the legacy keys must not survive at the top level
  assert.equal(config.rules, undefined);
  assert.equal(config.defaultPattern, undefined);
  assert.equal(config.onlyOrganized, undefined);
});

test("migrating a pre-sections config leaves galleries and images at their defaults", () => {
  const config = normalizeConfig({ rules: [{ id: "r1" }] });
  assert.deepEqual(config.galleries, DEFAULT_CONFIG.galleries);
  assert.deepEqual(config.images, DEFAULT_CONFIG.images);
});

test("galleries and images ship with automatic renaming off so upgrading never moves files unasked", () => {
  const config = normalizeConfig({ rules: [{ id: "r1" }] });
  assert.equal(config.galleries.autoRename, false);
  assert.equal(config.images.autoRename, false);
  assert.equal(config.scenes.autoRename, true);
});

test("galleries and images default to a keep-in-place folder pattern", () => {
  const config = normalizeConfig(undefined);
  assert.equal(config.galleries.defaultPattern.folderPattern, "{current}");
  assert.equal(config.images.defaultPattern.folderPattern, "{current}");
});

// A blank pattern used to mean "keep what this file already has". It is spelled
// {current} now, and stored blanks are rewritten so that nothing moves
test("blank patterns are migrated to {current}", () => {
  const config = normalizeConfig({
    scenes: {
      defaultPattern: { folderPattern: "  ", filenamePattern: "" },
      rules: [{ id: "r1", folderPattern: "", filenamePattern: "{title}" }],
    },
  });
  assert.equal(config.scenes.defaultPattern.folderPattern, "{current}");
  assert.equal(config.scenes.defaultPattern.filenamePattern, "{current}");
  assert.equal(config.scenes.rules[0].folderPattern, "{current}");
  // a rule that said something is left alone
  assert.equal(config.scenes.rules[0].filenamePattern, "{title}");
  // "/" is the library root, not a blank, and must survive
  const root = normalizeConfig({
    scenes: { defaultPattern: { folderPattern: "/" } },
  });
  assert.equal(root.scenes.defaultPattern.folderPattern, "/");
});

test("global formatting settings are preserved across the migration, not moved into scenes", () => {
  const config = normalizeConfig({
    rules: [{ id: "r1" }],
    delimiters: { performers: " & ", tags: ", " },
    sanitize: { maxSegmentLength: 120, spaceReplacement: "." },
  });
  assert.equal(config.delimiters.performers, " & ");
  assert.equal(config.sanitize.spaceReplacement, ".");
  assert.equal(config.scenes.delimiters, undefined);
});

test("an already-migrated config is left alone rather than migrated a second time", () => {
  const already = {
    scenes: { rules: [{ id: "kept" }], onlyOrganized: false },
    images: { rules: [{ id: "img" }] },
  };
  const config = normalizeConfig(already);
  assert.deepEqual(config.scenes.rules, [{ id: "kept" }]);
  assert.equal(config.scenes.onlyOrganized, false);
  assert.deepEqual(config.images.rules, [{ id: "img" }]);
});

test("a config carrying BOTH a scenes section and stray legacy keys keeps the section as the source of truth", () => {
  const config = normalizeConfig({
    scenes: { rules: [{ id: "new" }] },
    rules: [{ id: "stale" }],
  });
  assert.deepEqual(config.scenes.rules, [{ id: "new" }]);
});

test("a pre-sections config migrates its chosen StashID sources too, not just the toggle", () => {
  // these two are one setting in the UI: migrating onlyWithStashId without
  // stashIdEndpoints would silently widen the gate back to "any source"
  const config = normalizeConfig({
    onlyWithStashId: true,
    stashIdEndpoints: ["https://fansdb.cc/graphql"],
  });
  assert.equal(config.scenes.onlyWithStashId, true);
  assert.deepEqual(config.scenes.stashIdEndpoints, [
    "https://fansdb.cc/graphql",
  ]);
  assert.equal(config.stashIdEndpoints, undefined);
});

test("a hybrid config, sections plus leftover flat keys, drops the stale ones", () => {
  // produced by moving between plugin versions: the flat keys would otherwise
  // shadow the sections through entitySettings
  const config = normalizeConfig({
    scenes: { rules: [{ id: "kept" }] },
    images: { rules: [{ id: "img" }] },
    onlyWithStashId: true,
    stashIdEndpoints: ["https://fansdb.cc/graphql"],
    rules: [{ id: "stale" }],
    delimiters: { performers: " & ", tags: ", " },
  });
  assert.deepEqual(config.scenes.rules, [{ id: "kept" }]);
  assert.equal(config.onlyWithStashId, undefined);
  assert.equal(config.stashIdEndpoints, undefined);
  assert.equal(config.rules, undefined);
  // genuinely global settings are untouched
  assert.equal(config.delimiters.performers, " & ");
});

test("resetting a section restores its defaults but keeps rules, switched off", () => {
  const config = normalizeConfig({
    scenes: {
      autoRename: false,
      onlyOrganized: false,
      rules: [
        { id: "a", name: "Keep me", enabled: true },
        { id: "b", name: "Already off", enabled: false },
      ],
      defaultPattern: { folderPattern: "custom", libraryRoot: "/x" },
    },
  });
  const out = resetSection(config, "scenes");

  assert.equal(out.scenes.autoRename, DEFAULT_CONFIG.scenes.autoRename);
  assert.equal(out.scenes.onlyOrganized, DEFAULT_CONFIG.scenes.onlyOrganized);
  assert.equal(
    out.scenes.defaultPattern.folderPattern,
    DEFAULT_CONFIG.scenes.defaultPattern.folderPattern,
  );
  assert.equal(out.scenes.defaultPattern.libraryRoot, "");

  // the rules themselves survive, only disabled
  assert.equal(out.scenes.rules.length, 2);
  assert.equal(out.scenes.rules[0].name, "Keep me");
  assert.deepEqual(
    out.scenes.rules.map((r) => r.enabled),
    [false, false],
  );
});

test("resetting one section leaves the others and the global settings alone", () => {
  const config = normalizeConfig({
    scenes: { autoRename: false },
    images: { autoRename: true, rules: [{ id: "i", enabled: true }] },
    delimiters: { performers: " & ", tags: ", " },
  });
  const out = resetSection(config, "scenes");
  assert.deepEqual(out.images.rules, [{ id: "i", enabled: true }]);
  assert.equal(out.images.autoRename, true);
  assert.equal(out.delimiters.performers, " & ");
});

test("resetting does not mutate DEFAULT_CONFIG, so a later reset still works", () => {
  const config = normalizeConfig({ scenes: { rules: [{ id: "a" }] } });
  const out = resetSection(config, "scenes");
  out.scenes.defaultPattern.folderPattern = "clobbered";
  out.scenes.rules.push({ id: "extra" });

  assert.notEqual(
    DEFAULT_CONFIG.scenes.defaultPattern.folderPattern,
    "clobbered",
  );
  assert.equal(DEFAULT_CONFIG.scenes.rules.length, 0);
  assert.equal(resetSection(config, "scenes").scenes.rules.length, 1);
});

test("resetting an unknown entity type is a no-op rather than a crash", () => {
  const config = normalizeConfig({ scenes: { autoRename: false } });
  assert.equal(resetSection(config, "nonsense"), config);
});

test("resetting formatting restores the shared settings and nothing else", () => {
  const config = normalizeConfig({
    scenes: {
      autoRename: false,
      rules: [{ id: "a", name: "Keep me", enabled: true }],
      defaultPattern: { folderPattern: "custom" },
    },
    images: { rules: [{ id: "i", enabled: true }] },
    delimiters: { performers: " & ", tags: " | " },
    sanitize: { maxSegmentLength: 80, spaceReplacement: "." },
  });
  const out = resetFormatting(config);

  assert.deepEqual(out.delimiters, DEFAULT_CONFIG.delimiters);
  assert.deepEqual(out.sanitize, DEFAULT_CONFIG.sanitize);

  // the entity sections, including rules, are untouched
  assert.equal(out.scenes.autoRename, false);
  assert.equal(out.scenes.defaultPattern.folderPattern, "custom");
  assert.deepEqual(out.scenes.rules, [
    { id: "a", name: "Keep me", enabled: true },
  ]);
  assert.deepEqual(out.images.rules, [{ id: "i", enabled: true }]);
});

test("resetting formatting does not mutate DEFAULT_CONFIG", () => {
  const config = normalizeConfig({ sanitize: { spaceReplacement: "." } });
  const out = resetFormatting(config);
  out.delimiters.performers = "clobbered";
  out.sanitize.maxSegmentLength = 1;
  assert.notEqual(DEFAULT_CONFIG.delimiters.performers, "clobbered");
  assert.notEqual(DEFAULT_CONFIG.sanitize.maxSegmentLength, 1);
});

test("the two resets are complementary: neither touches the other's settings", () => {
  const config = normalizeConfig({
    scenes: { autoRename: false, rules: [{ id: "a", enabled: true }] },
    delimiters: { performers: " & ", tags: " | " },
  });
  // resetting a section leaves formatting alone
  assert.equal(resetSection(config, "scenes").delimiters.performers, " & ");
  // resetting formatting leaves the section alone
  assert.equal(resetFormatting(config).scenes.autoRename, false);
});

test("a type with no entities gets no tab, whichever type it is", () => {
  assert.deepEqual(
    availableEntityTypes({ scenes: 7, galleries: 8, images: 22 }),
    ["scenes", "galleries", "images"],
  );
  assert.deepEqual(
    availableEntityTypes({ scenes: 7, galleries: 0, images: 0 }),
    ["scenes"],
  );
  // an image-only Stash hides scenes too
  assert.deepEqual(
    availableEntityTypes({ scenes: 0, galleries: 0, images: 5 }),
    ["images"],
  );
  assert.deepEqual(
    availableEntityTypes({ scenes: 0, galleries: 0, images: 0 }),
    [],
  );
});

test("unknown counts show every tab, rather than hiding settings", () => {
  // the stats query failing must not lock the user out of their own config
  assert.deepEqual(availableEntityTypes(null), [
    "scenes",
    "galleries",
    "images",
  ]);
  assert.deepEqual(availableEntityTypes(undefined), [
    "scenes",
    "galleries",
    "images",
  ]);
});

test("a missing count is treated as none, not as unknown", () => {
  assert.deepEqual(availableEntityTypes({ scenes: 3 }), ["scenes"]);
});

test("the active tab falls back when the remembered one is no longer available", () => {
  assert.equal(resolveActiveType(["scenes", "images"], "images"), "images");
  // remembered galleries, but they have all gone
  assert.equal(resolveActiveType(["scenes", "images"], "galleries"), "scenes");
  // image-only library, remembered default of scenes
  assert.equal(resolveActiveType(["images"], "scenes"), "images");
  assert.equal(resolveActiveType([], "scenes"), undefined);
});
