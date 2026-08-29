import { criterionValue, isPresenceOp } from "./custom-fields.js";
import { isPerformerOp, isAllQuantifier } from "./performer-condition.js";
import { isStudioTraitOp } from "./studio-condition.js";
import { ratingRangeCriterion } from "./rating-range.js";

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
  const criterion = ratingRangeCriterion(value);
  return criterion ? { rating100: criterion } : null;
}

function pathFilter(condition) {
  if (!condition.value) return null;
  const op = condition.op || "INCLUDES";
  const filter = { path: { value: condition.value, modifier: op } };
  // Stash returns fileless scenes for this modifier but we can skip those
  if (op === "NOT_MATCHES_REGEX") {
    filter.file_count = { value: 0, modifier: "GREATER_THAN" };
  }
  return filter;
}

function groupPresenceFilter(condition) {
  if (condition.op !== "is_null" && condition.op !== "not_null") {
    return null;
  }
  return hierarchicalFilter("groups", condition, 0);
}

// `op` is passed in rather than read off the condition because the two custom
// field conditions keep it in different places: the item's own spends `op` on
// the comparison, while a performer's spends it on saying which kind of
// performer condition it is and keeps the comparison in `valueOp`
function customFieldCriterion(condition, op) {
  const key = String(condition.key == null ? "" : condition.key);
  if (!key) {
    return null;
  }
  const criterion = { field: key, modifier: op };
  if (!isPresenceOp(op)) {
    const values = criterionValue(op, condition.value);
    if (!values) {
      return null;
    }
    criterion.value = values;
  }
  return criterion;
}

function customFieldFilter(condition) {
  const criterion = customFieldCriterion(condition, condition.op);
  return criterion ? { custom_fields: [criterion] } : null;
}

// performers_filter is a full PerformerFilterType joined with EXISTS, so it
// asks "does any performer on this item match", which is exactly what
// performersMatching answers locally.
//
// filter_favorites is deliberate rather than the scene-level performer_favorite
// shortcut: the two agree on true and disagree on false, where the shortcut
// means "no performer is a favourite" and also matches items with no performers
// at all. Going through performers_filter keeps every performer condition on
// the same EXISTS semantics
function performerSubFilter(condition) {
  if (condition.op === "favorite") {
    return { performers_filter: { filter_favorites: true } };
  }
  if (condition.op === "not_favorite") {
    return { performers_filter: { filter_favorites: false } };
  }
  if (condition.op === "not_rated") {
    return {
      performers_filter: { rating100: { value: 0, modifier: "IS_NULL" } },
    };
  }
  if (condition.op === "rating") {
    const criterion = ratingRangeCriterion(condition.value);
    return criterion ? { performers_filter: { rating100: criterion } } : null;
  }
  const criterion = customFieldCriterion(condition, condition.valueOp);
  return criterion
    ? { performers_filter: { custom_fields: [criterion] } }
    : null;
}

// studios_filter mirrors performers_filter above, but a scene has only one
// (direct) studio rather than a list, so there is no EXISTS ambiguity to
// worry about: it is StudioFilterType's own "favorite", not a filter_favorites
// shortcut
function studioSubFilter(condition) {
  if (condition.op === "favorite") {
    return { studios_filter: { favorite: true } };
  }
  if (condition.op === "not_favorite") {
    return { studios_filter: { favorite: false } };
  }
  if (condition.op === "not_rated") {
    return {
      studios_filter: { rating100: { value: 0, modifier: "IS_NULL" } },
    };
  }
  if (condition.op === "rating") {
    const criterion = ratingRangeCriterion(condition.value);
    return criterion ? { studios_filter: { rating100: criterion } } : null;
  }
  const criterion = customFieldCriterion(condition, condition.valueOp);
  return criterion ? { studios_filter: { custom_fields: [criterion] } } : null;
}

function conditionToFilter(condition) {
  switch (condition.field) {
    case "custom_field":
      return customFieldFilter(condition);
    case "group":
      return groupPresenceFilter(condition);
    case "studio":
      return isStudioTraitOp(condition.op)
        ? studioSubFilter(condition)
        : hierarchicalFilter(
            "studios",
            condition,
            condition.op === "any_of_or_descendant" ? -1 : 0,
          );
    case "performer":
      return isPerformerOp(condition.op)
        ? performerSubFilter(condition)
        : multiCriterionFilter("performers", condition);
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

// We can't do an OR-query for multiple endpoints so we fall back to
// querying by count if the user allows multiple endpoints and then
// filter it ourselves: we might fetch too much (user wants StashDB or TPDB
// and scene has FansDB and JavStash) but that's easier than multiple queries
export function stashIdGate(endpoints) {
  const wanted = endpoints || [];
  if (wanted.length === 1) {
    return {
      stash_ids_endpoint: { endpoint: wanted[0], modifier: "NOT_NULL" },
    };
  }
  return { stash_id_count: { value: 0, modifier: "GREATER_THAN" } };
}

export function ruleFilterIsApproximate(rule) {
  return ((rule && rule.conditions) || []).some((condition) => {
    return (
      condition &&
      condition.field === "performer" &&
      isPerformerOp(condition.op) &&
      isAllQuantifier(condition)
    );
  });
}

export function stashIdGateIsApproximate(config) {
  return !!(
    config &&
    config.onlyWithStashId &&
    (config.stashIdEndpoints || []).length > 1
  );
}

export function configGates(config) {
  const gates = [];
  if (config && config.onlyOrganized) {
    gates.push({ organized: true });
  }
  if (config && config.onlyWithStashId) {
    gates.push(stashIdGate(config.stashIdEndpoints));
  }
  return gates;
}

// The gates alone, for previewing what the config does without any rule
export function configGateFilter(config) {
  const gates = configGates(config);
  return gates.length === 0 ? null : foldFragments(gates, "AND");
}

export function ruleToPreviewFilter(rule, config) {
  const ruleFilter = ruleToSceneFilter(rule);
  if (!ruleFilter) {
    return null;
  }
  return foldFragments(configGates(config).concat([ruleFilter]), "AND");
}
