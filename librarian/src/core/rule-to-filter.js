function asList(value) {
  return Array.isArray(value) ? value : [value];
}

function idListModifier(op) {
  if (op === "all_of") return "INCLUDES_ALL";
  if (op === "any_of" || op === "equals" || op === "any_of_or_descendant")
    return "INCLUDES";
  if (op === "is_null") return "IS_NULL";
  if (op === "not_null") return "NOT_NULL";
  return null;
}

function nonEmptyIds(value) {
  return asList(value).filter((v) => {
    return v != null && v !== "";
  });
}

function isPresenceModifier(modifier) {
  return modifier === "IS_NULL" || modifier === "NOT_NULL";
}

function hierarchicalFilter(key, condition, depth) {
  const modifier = idListModifier(condition.op);
  if (!modifier) return null;
  const presence = isPresenceModifier(modifier);
  const values = presence ? [] : nonEmptyIds(condition.value);
  if (values.length === 0 && !presence) return null;
  const field = {};
  field[key] = { value: values, modifier: modifier, depth: depth };
  return field;
}

function multiCriterionFilter(key, condition) {
  const modifier = idListModifier(condition.op);
  if (!modifier) return null;
  const presence = isPresenceModifier(modifier);
  const values = presence ? [] : nonEmptyIds(condition.value);
  if (values.length === 0 && !presence) return null;
  const field = {};
  field[key] = { value: values, modifier: modifier };
  return field;
}

function ratingFilter(value) {
  if (!value || (value.min == null && value.max == null)) {
    return null;
  }
  const min100 = value.min != null ? Math.round(value.min * 10) : 0;
  const max100 = value.max != null ? Math.round(value.max * 10) : 100;
  return { rating100: { value: min100, value2: max100, modifier: "BETWEEN" } };
}

function pathFilter(condition) {
  if (!condition.value) return null;
  return {
    path: { value: condition.value, modifier: condition.op || "INCLUDES" },
  };
}

function conditionToFilter(condition) {
  switch (condition.field) {
    case "studio":
      return hierarchicalFilter(
        "studios",
        condition,
        condition.op === "any_of_or_descendant" ? -1 : 0,
      );
    case "performer":
      return multiCriterionFilter("performers", condition);
    case "tag":
      return hierarchicalFilter("tags", condition, 0);
    case "rating":
      return ratingFilter(condition.value);
    case "path":
      return pathFilter(condition);
    default:
      return null;
  }
}

function foldFragments(fragments, logic) {
  if (fragments.length === 0) return null;
  const key = logic === "OR" ? "OR" : "AND";
  let acc = fragments[fragments.length - 1];
  for (let i = fragments.length - 2; i >= 0; i--) {
    const wrapper = Object.assign({}, fragments[i]);
    wrapper[key] = acc;
    acc = wrapper;
  }
  return acc;
}

export function ruleToSceneFilter(rule) {
  const conditions = (rule && rule.conditions) || [];
  if (conditions.length === 0) {
    return null;
  }
  const fragments = [];
  for (let i = 0; i < conditions.length; i++) {
    const fragment = conditionToFilter(conditions[i]);
    if (!fragment) {
      return null;
    }
    fragments.push(fragment);
  }
  const logic = rule.conditionLogic === "OR" ? "OR" : "AND";
  return foldFragments(fragments, logic);
}

export function ruleToPreviewFilter(rule, config) {
  const ruleFilter = ruleToSceneFilter(rule);
  if (!ruleFilter) {
    return null;
  }
  const gates = [];
  if (config && config.onlyOrganized) {
    gates.push({ organized: true });
  }
  if (config && config.onlyWithStashId) {
    gates.push({ stash_id_count: { value: 0, modifier: "GREATER_THAN" } });
  }
  return foldFragments(gates.concat([ruleFilter]), "AND");
}
