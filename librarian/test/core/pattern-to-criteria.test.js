import test from "node:test";
import assert from "node:assert/strict";
import {
  requiredTokenCriteria,
  defaultPatternCriteria,
  criteriaGaps,
} from "../../src/core/pattern-to-criteria.js";

const keys = (criteria) =>
  criteria.map((c) => c.type + (c.modifier ? ":" + c.modifier : ""));

test("a required token contributes the criterion that selects items having it", () => {
  assert.deepEqual(keys(requiredTokenCriteria(["{studio}"])), [
    "studios:NOT_NULL",
  ]);
  assert.deepEqual(keys(requiredTokenCriteria(["{performers}"])), [
    "performers:NOT_NULL",
  ]);
  assert.deepEqual(keys(requiredTokenCriteria(["{stash_id}"])), [
    "stash_id_count:GREATER_THAN",
  ]);
});

test("the group tokens gate on membership, and only once", () => {
  assert.deepEqual(keys(requiredTokenCriteria(["{group}"])), [
    "groups:NOT_NULL",
  ]);
  assert.deepEqual(keys(requiredTokenCriteria(["{group_idx}"])), [
    "groups:NOT_NULL",
  ]);
  assert.deepEqual(
    keys(requiredTokenCriteria(["{group}", "{title} [Sc. {group_idx}]"])),
    ["groups:NOT_NULL", "title:NOT_NULL"],
  );
  assert.deepEqual(requiredTokenCriteria(["{group?}"]), []);
});

// {title?} renders empty instead of reporting missing data, so a scene without
// a title is not skipped for it and must not be filtered out
test("an optional token gates nothing", () => {
  assert.deepEqual(requiredTokenCriteria(["{title?}"]), []);
  assert.deepEqual(keys(requiredTokenCriteria(["{studio} - {title?}"])), [
    "studios:NOT_NULL",
  ]);
});

test("tokens sharing a criterion contribute it once", () => {
  assert.deepEqual(
    keys(
      requiredTokenCriteria(["{studio}/{studio_root}", "{studio_hierarchy}"]),
    ),
    ["studios:NOT_NULL"],
  );
  assert.deepEqual(
    keys(requiredTokenCriteria(["{date_year}/{date_month} - {date}"])),
    ["date:NOT_NULL"],
  );
});

// these depend on a rule's own conditions or on a file that must exist anyway,
// so asking the filter about them would narrow the page for no reason
test("tokens that cannot gate the default pattern are ignored", () => {
  assert.deepEqual(requiredTokenCriteria(["{matched_performers}"]), []);
  assert.deepEqual(requiredTokenCriteria(["{matched_tags}"]), []);
  assert.deepEqual(requiredTokenCriteria(["{resolution}/{video_codec}"]), []);
  assert.deepEqual(requiredTokenCriteria(["{current}"]), []);
  // a malformed token renders literally, so it requires nothing
  assert.deepEqual(requiredTokenCriteria(["{studio bogus}"]), []);
});

test("the default pattern's criteria combine the config gates with its tokens", () => {
  const criteria = defaultPatternCriteria({
    onlyOrganized: true,
    onlyWithStashId: false,
    defaultPattern: {
      folderPattern: "{studio_hierarchy}",
      filenamePattern: "{studio} - {date} - {title}",
    },
  });
  assert.deepEqual(keys(criteria), [
    "organized",
    "file_count:GREATER_THAN",
    "studios:NOT_NULL",
    "date:NOT_NULL",
    "title:NOT_NULL",
  ]);
});

test("the stash-id gate is not repeated when the pattern also uses {stash_id}", () => {
  const criteria = defaultPatternCriteria({
    onlyWithStashId: true,
    defaultPattern: {
      folderPattern: "{current}",
      filenamePattern: "{stash_id}",
    },
  });
  assert.deepEqual(keys(criteria), [
    "stash_id_count:GREATER_THAN",
    "file_count:GREATER_THAN",
  ]);
});

test("a file is always required, since there is nothing to rename without one", () => {
  const criteria = defaultPatternCriteria({
    defaultPattern: {
      folderPattern: "{current}",
      filenamePattern: "{current}",
    },
  });
  assert.deepEqual(keys(criteria), ["file_count:GREATER_THAN"]);
});

test("defaultPatternCriteria survives a missing or empty config", () => {
  assert.deepEqual(keys(defaultPatternCriteria(undefined)), [
    "file_count:GREATER_THAN",
  ]);
  assert.deepEqual(keys(defaultPatternCriteria({})), [
    "file_count:GREATER_THAN",
  ]);
});

// A flat AND of criteria cannot negate a group, so these stay out of the filter
// and the button says so rather than implying the page is free of skips
test("gaps name what the filter cannot express", () => {
  assert.deepEqual(criteriaGaps({}), []);
  assert.deepEqual(
    criteriaGaps({
      excludeConditions: { conditions: [{ field: "tag", op: "any_of" }] },
    }),
    ["exclusions"],
  );
  assert.deepEqual(criteriaGaps({ rules: [{ id: "r1" }] }), [
    "claimed_by_rule",
  ]);
  // a disabled rule claims nothing, so it is not a gap
  assert.deepEqual(criteriaGaps({ rules: [{ id: "r1", enabled: false }] }), []);
});
