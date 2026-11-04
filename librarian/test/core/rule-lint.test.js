import test from "node:test";
import assert from "node:assert/strict";
import {
  findConditionProblems,
  textWordSplit,
} from "../../src/core/rule-lint.js";

const anyTag = { field: "tag", op: "not_null", value: [] };
const noTag = { field: "tag", op: "is_null", value: [] };

test("is set OR is not set on the same field matches everything, which the rule editor should say out loud", () => {
  const problems = findConditionProblems("OR", [anyTag, noTag]);
  assert.deepEqual(problems, [
    { kind: "always_matches", field: "tag", key: "" },
  ]);
});

test("the same pair under AND can never match", () => {
  const problems = findConditionProblems("AND", [noTag, anyTag]);
  assert.deepEqual(problems, [
    { kind: "never_matches", field: "tag", key: "" },
  ]);
});

test("a third condition does not rescue the pair: under OR the tautology already claims every entity", () => {
  const path = { field: "path", op: "EXCLUDES", value: "sort" };
  const problems = findConditionProblems("OR", [anyTag, noTag, path]);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].kind, "always_matches");
});

test("the pair is only a pair on the same subject: tag set and performer not set is an ordinary rule", () => {
  const noPerformer = { field: "performer", op: "is_null", value: [] };
  assert.deepEqual(findConditionProblems("OR", [anyTag, noPerformer]), []);
});

test("custom field presence is keyed by field name, so two keys are two questions", () => {
  const roleSet = {
    field: "custom_field",
    key: "role",
    op: "NOT_NULL",
    value: "",
  };
  const roleUnset = {
    field: "custom_field",
    key: "role",
    op: "IS_NULL",
    value: "",
  };
  const eraUnset = {
    field: "custom_field",
    key: "era",
    op: "IS_NULL",
    value: "",
  };
  assert.deepEqual(findConditionProblems("OR", [roleSet, eraUnset]), []);
  assert.deepEqual(findConditionProblems("OR", [roleSet, roleUnset]), [
    { kind: "always_matches", field: "custom_field", key: "role" },
  ]);
});

test("performer and studio custom fields carry their presence in valueOp", () => {
  const set = {
    field: "performer",
    op: "custom_field",
    key: "role",
    valueOp: "NOT_NULL",
    value: "",
  };
  const unset = {
    field: "performer",
    op: "custom_field",
    key: "role",
    valueOp: "IS_NULL",
    value: "",
  };
  assert.equal(
    findConditionProblems("AND", [set, unset])[0].kind,
    "never_matches",
  );
});

test("each subject is reported once however many times the pair recurs", () => {
  const problems = findConditionProblems("OR", [anyTag, noTag, anyTag, noTag]);
  assert.equal(problems.length, 1);
});

test("an unquoted multi-word path value is reported with the words it splits into", () => {
  const condition = {
    field: "path",
    op: "EXCLUDES",
    value: "To Sort and Name",
  };
  assert.deepEqual(textWordSplit(condition), ["To", "Sort", "and", "Name"]);
});

test("a quoted phrase, a single word, and a whole-path comparison do not split", () => {
  assert.equal(
    textWordSplit({
      field: "path",
      op: "EXCLUDES",
      value: '"To Sort and Name"',
    }),
    null,
  );
  assert.equal(
    textWordSplit({ field: "path", op: "INCLUDES", value: "Standard" }),
    null,
  );
  assert.equal(
    textWordSplit({
      field: "path",
      op: "EQUALS",
      value: "F:\\To sort and name",
    }),
    null,
  );
  assert.equal(
    textWordSplit({ field: "tag", op: "any_of", value: ["To Sort"] }),
    null,
  );
});
