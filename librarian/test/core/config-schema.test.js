import test from "node:test";
import assert from "node:assert/strict";
import { normalizeConfig, DEFAULT_CONFIG } from "../../src/core/config-schema.js";

test("a fresh config (no raw at all) returns DEFAULT_CONFIG's own shape", () => {
  assert.deepEqual(normalizeConfig(undefined), DEFAULT_CONFIG);
});

test("raw values override the matching default, field by field", () => {
  const config = normalizeConfig({ onlyOrganized: false, rules: [{ id: "r1" }] });
  assert.equal(config.scenes.onlyOrganized, false);
  assert.deepEqual(config.scenes.rules, [{ id: "r1" }]);
  // Untouched fields still fall back to their own default.
  assert.equal(config.scenes.onlyWithStashId, false);
  assert.equal(config.scenes.autoRename, true);
});

test("a partially-specified nested object (defaultPattern) is merged field by field, not replaced wholesale", () => {
  const config = normalizeConfig({ defaultPattern: { libraryRoot: "/data/main" } });
  assert.equal(config.scenes.defaultPattern.libraryRoot, "/data/main");
  assert.equal(
    config.scenes.defaultPattern.folderPattern,
    DEFAULT_CONFIG.scenes.defaultPattern.folderPattern,
  );
  assert.equal(config.scenes.defaultPattern.sortBy, "alphabetical");
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
    excludeConditions: { conditionLogic: "AND", conditions: [{ field: "tag" }] },
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
  assert.equal(config.galleries.defaultPattern.folderPattern, "");
  assert.equal(config.images.defaultPattern.folderPattern, "");
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
