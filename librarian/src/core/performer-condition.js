import { evaluateCustomField, customFieldsOf } from "./custom-fields.js";
import { ratingInRange } from "./rating-range.js";

const PERFORMER_OPS = {
  favorite: true,
  not_favorite: true,
  rating: true,
  not_rated: true,
  custom_field: true,
};

export function isPerformerOp(op) {
  return Object.prototype.hasOwnProperty.call(PERFORMER_OPS, op);
}

export function performerMatches(performer, condition) {
  if (!performer) {
    return false;
  }
  switch (condition.op) {
    case "favorite":
      return !!performer.favorite;
    case "not_favorite":
      return !performer.favorite;
    case "rating":
      return ratingInRange(performer.rating100, condition.value);
    case "not_rated":
      return performer.rating100 == null;
    case "custom_field":
      // the comparison lives in valueOp, op having been spent on saying which
      // kind of performer condition this is
      return evaluateCustomField(
        customFieldsOf(performer),
        condition.key,
        condition.valueOp,
        condition.value,
      );
    default:
      return false;
  }
}

export function performersMatching(performers, condition) {
  return (performers || []).filter((performer) => {
    return performerMatches(performer, condition);
  });
}

export function isAllQuantifier(condition) {
  return !!condition && condition.quantifier === "all";
}

export function performerConditionHolds(performers, condition) {
  const list = performers || [];
  const matched = performersMatching(list, condition);
  return isAllQuantifier(condition)
    ? list.length > 0 && matched.length === list.length
    : matched.length > 0;
}
