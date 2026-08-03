import test from "node:test";
import assert from "node:assert/strict";
import { normalizeConfig, DEFAULT_CONFIG } from "../../src/core/config-schema.js";

test("a fresh config (no raw at all) returns DEFAULT_CONFIG's own shape", () => {
  assert.deepEqual(normalizeConfig(undefined), DEFAULT_CONFIG);
});

test("raw values override the matching default, field by field", () => {
  const config = normalizeConfig({ onlyOrganized: false, rules: [{ id: "r1" }] });
  assert.equal(config.onlyOrganized, false);
  assert.deepEqual(config.rules, [{ id: "r1" }]);
  // Untouched top-level fields still fall back to their own default.
  assert.equal(config.onlyWithStashId, false);
  assert.equal(config.autoRename, true);
});

test("a partially-specified nested object (defaultPattern) is merged field by field, not replaced wholesale", () => {
  const config = normalizeConfig({ defaultPattern: { libraryRoot: "/data/main" } });
  assert.equal(config.defaultPattern.libraryRoot, "/data/main");
  assert.equal(config.defaultPattern.folderPattern, DEFAULT_CONFIG.defaultPattern.folderPattern);
  assert.equal(config.defaultPattern.sortBy, "alphabetical");
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
