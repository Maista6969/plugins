import { pathSearchTerms } from "./string-criterion.js";

// "is set" and "is not set" on the same thing split every entity between them.
// Under ANY that pair is always true, so the rule claims everything; under ALL
// it is never true, so the rule claims nothing. Both are silent otherwise: the
// rule saves fine and the preview count is the only hint
function presenceOf(condition) {
  if (!condition) {
    return null;
  }
  const op = String(condition.op || "");
  const valueOp = String(condition.valueOp || "");
  if (op === "is_null" || op === "IS_NULL" || valueOp === "IS_NULL") {
    return "unset";
  }
  if (op === "not_null" || op === "NOT_NULL" || valueOp === "NOT_NULL") {
    return "set";
  }
  return null;
}

// A custom field asks about one key, so two keys are two different questions
function presenceSubject(condition) {
  const key =
    condition.op === "custom_field" || condition.field === "custom_field"
      ? String(condition.key || "")
      : "";
  return String(condition.field || "") + "\0" + key;
}

export function findConditionProblems(conditionLogic, conditions) {
  const list = Array.isArray(conditions) ? conditions : [];
  const seen = {};
  const problems = [];
  const reported = {};
  list.forEach((condition) => {
    const presence = presenceOf(condition);
    if (!presence) {
      return;
    }
    const subject = presenceSubject(condition);
    seen[subject] = seen[subject] || {};
    seen[subject][presence] = true;
    if (seen[subject].set && seen[subject].unset && !reported[subject]) {
      reported[subject] = true;
      problems.push({
        kind: conditionLogic === "OR" ? "always_matches" : "never_matches",
        field: condition.field,
        key: condition.key || "",
      });
    }
  });
  return problems;
}

// "contains" and "doesn't contain" match each word of an unquoted value on its
// own, the way Stash's own string filters do. A library name like "To sort and
// name" then excludes every path holding "and", which is rarely what was meant
export function textWordSplit(condition) {
  if (
    !condition ||
    (condition.field !== "path" && condition.field !== "title") ||
    (condition.op !== "INCLUDES" && condition.op !== "EXCLUDES")
  ) {
    return null;
  }
  const terms = pathSearchTerms(condition.value);
  return terms.length > 1 ? terms : null;
}
