import { matchesAnyPath } from "./string-criterion.js";
import {
  evaluateCustomField,
  someEntityCustomField,
  isPresenceOp,
} from "./custom-fields.js";

function applyListOp(list, op, value) {
  if (op === "is_null") {
    return list.length === 0;
  }
  if (op === "not_null") {
    return list.length > 0;
  }
  const values = Array.isArray(value) ? value : [value];
  if (op === "any_of") {
    return list.some((item) => {
      return values.indexOf(item) !== -1;
    });
  }
  if (op === "all_of") {
    return (
      values.length > 0 &&
      values.every((v) => {
        return list.indexOf(v) !== -1;
      })
    );
  }
  if (op === "contains") {
    return list.some((item) => {
      return item.indexOf(value) !== -1;
    });
  }
  // default / "equals" against a list means "list includes this exact value"
  return list.indexOf(value) !== -1;
}

function evaluateRating(sceneView, value) {
  if (sceneView.rating100 == null) {
    return false;
  }
  const min = value && value.min != null ? value.min * 10 : null;
  const max = value && value.max != null ? value.max * 10 : null;
  if (min != null && sceneView.rating100 < min) {
    return false;
  }
  if (max != null && sceneView.rating100 > max) {
    return false;
  }
  return min != null || max != null;
}

function evaluateGroup(sceneView, condition) {
  if (condition.op !== "is_null" && condition.op !== "not_null") {
    return false;
  }
  const ids = (sceneView.groups || []).map((g) => {
    return g.id;
  });
  return applyListOp(ids, condition.op, condition.value);
}

export function evaluateCondition(sceneView, condition) {
  switch (condition.field) {
    case "custom_field":
      return evaluateCustomField(
        sceneView.customFields,
        condition.key,
        condition.op,
        condition.value,
      );
    case "performer_custom_field":
      return someEntityCustomField(
        sceneView.performers,
        condition.key,
        condition.op,
        condition.value,
      );
    case "group":
      return evaluateGroup(sceneView, condition);
    case "studio": {
      if (condition.op === "any_of_or_descendant") {
        return applyListOp(sceneView.studioIds, "any_of", condition.value);
      }
      const leafIds = sceneView.studioIds.length
        ? [sceneView.studioIds[sceneView.studioIds.length - 1]]
        : [];
      return applyListOp(leafIds, condition.op, condition.value);
    }
    case "performer":
      return applyListOp(sceneView.performerIds, condition.op, condition.value);
    case "tag":
      return applyListOp(sceneView.tagIds, condition.op, condition.value);
    case "rating":
      return evaluateRating(sceneView, condition.value);
    case "path": {
      const paths = (sceneView.files || []).map((f) => {
        return f.path;
      });
      return matchesAnyPath(paths, {
        modifier: condition.op,
        value: condition.value,
      });
    }
    default:
      return false;
  }
}

export function getMatchedEntityIds(sceneView, rule, field) {
  if (!rule) {
    return [];
  }
  const sceneIds =
    field === "performer" ? sceneView.performerIds : sceneView.tagIds;
  const matched = [];
  (rule.conditions || []).forEach((condition) => {
    if (condition.field !== field) {
      return;
    }
    if (!evaluateCondition(sceneView, condition)) {
      return;
    }
    const values = Array.isArray(condition.value)
      ? condition.value
      : [condition.value];
    values.forEach((v) => {
      if (sceneIds.indexOf(v) !== -1 && matched.indexOf(v) === -1) {
        matched.push(v);
      }
    });
  });
  return matched;
}

export function matchingConditions(sceneView, conditionLogic, conditions) {
  const list = conditions || [];
  if (list.length === 0) {
    return [];
  }
  const logic = conditionLogic === "OR" ? "OR" : "AND";
  const results = list.map((condition) => {
    return {
      condition: condition,
      matched: evaluateCondition(sceneView, condition),
    };
  });
  const overallMatch =
    logic === "OR"
      ? results.some((r) => {
          return r.matched;
        })
      : results.every((r) => {
          return r.matched;
        });
  if (!overallMatch) {
    return [];
  }

  return results
    .filter((r) => {
      return r.matched;
    })
    .map((r) => {
      return r.condition;
    });
}

export function evaluateConditions(sceneView, conditionLogic, conditions) {
  return matchingConditions(sceneView, conditionLogic, conditions).length > 0;
}

const FIELD_LABEL = {
  studio: "studio",
  performer: "performer",
  tag: "tag",
};

const CUSTOM_FIELD_OP_LABEL = {
  EQUALS: "is",
  NOT_EQUALS: "is not",
  INCLUDES: "contains",
  EXCLUDES: "doesn't contain",
  MATCHES_REGEX: "matches regex",
  NOT_MATCHES_REGEX: "doesn't match regex",
  GREATER_THAN: "is more than",
  LESS_THAN: "is less than",
  IS_NULL: "is not set",
  NOT_NULL: "is set",
};

const PATH_MODIFIER_LABEL = {
  INCLUDES: "contains",
  EXCLUDES: "doesn't contain",
  EQUALS: "is",
  NOT_EQUALS: "is not",
  MATCHES_REGEX: "matches regex",
  NOT_MATCHES_REGEX: "doesn't match regex",
};

function overlappingNames(sceneIds, sceneNames, conditionValue) {
  const values = Array.isArray(conditionValue)
    ? conditionValue
    : [conditionValue];
  const names = [];
  values.forEach((v) => {
    const idx = sceneIds.indexOf(v);
    if (idx !== -1 && names.indexOf(sceneNames[idx]) === -1) {
      names.push(sceneNames[idx]);
    }
  });
  return names;
}

function describeListField(label, sceneIds, sceneNames, condition) {
  if (condition.op === "is_null") {
    return label + " is not set";
  }
  if (condition.op === "not_null") {
    return label + " is set";
  }
  const names = overlappingNames(sceneIds, sceneNames, condition.value);
  const suffix =
    condition.op === "any_of_or_descendant" ? " (including subsidiaries)" : "";
  return (
    label +
    " is " +
    (names.length ? "'" + names.join("', '") + "'" : "(unknown)") +
    suffix
  );
}

function describeCustomField(prefix, condition) {
  const label = CUSTOM_FIELD_OP_LABEL[condition.op] || condition.op;
  const named = prefix + ' "' + condition.key + '" ' + label;
  return isPresenceOp(condition.op)
    ? named
    : named + " '" + condition.value + "'";
}

export function describeCondition(sceneView, condition) {
  switch (condition.field) {
    case "custom_field":
      return describeCustomField("custom field", condition);
    case "performer_custom_field":
      return describeCustomField("a performer's custom field", condition);
    case "group": {
      if (condition.op === "is_null") {
        return "belongs to no group";
      }
      // names it rather than just saying yes: which group matched is exactly
      // what {group} is about to put in the path
      const names = (sceneView.groups || [])
        .map((g) => {
          return g.name;
        })
        .filter((name) => {
          return !!name;
        });
      return names.length
        ? "belongs to '" + names.join("', '") + "'"
        : "belongs to a group";
    }
    case "studio":
      return describeListField(
        FIELD_LABEL[condition.field],
        sceneView.studioIds,
        sceneView.studioNames,
        condition,
      );
    case "performer":
      return describeListField(
        "performer",
        sceneView.performerIds,
        sceneView.performerNames,
        condition,
      );
    case "tag":
      return describeListField(
        "tag",
        sceneView.tagIds,
        sceneView.tagNames,
        condition,
      );
    case "rating": {
      const value = condition.value || {};
      if (value.min != null && value.max != null) {
        return "rating is between " + value.min + " and " + value.max;
      }
      if (value.min != null) {
        return "rating is at least " + value.min;
      }
      if (value.max != null) {
        return "rating is at most " + value.max;
      }
      return "rating";
    }
    case "path": {
      const label = PATH_MODIFIER_LABEL[condition.op] || condition.op;
      return "path " + label + " '" + condition.value + "'";
    }
    default:
      return condition.field;
  }
}

export function matchRule(sceneView, rules) {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (rule.enabled === false) {
      continue;
    }
    if (evaluateConditions(sceneView, rule.conditionLogic, rule.conditions)) {
      return rule;
    }
  }
  return null;
}
