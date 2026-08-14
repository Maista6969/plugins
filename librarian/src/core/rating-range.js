// A range with neither side set says nothing
export function isEmptyRatingRange(range) {
  return !range || (range.min == null && range.max == null);
}

export function ratingInRange(rating100, range) {
  if (rating100 == null || isEmptyRatingRange(range)) {
    return false;
  }
  const min = range.min != null ? range.min * 10 : null;
  const max = range.max != null ? range.max * 10 : null;
  if (min != null && rating100 < min) {
    return false;
  }
  if (max != null && rating100 > max) {
    return false;
  }
  return true;
}

export function ratingRangeCriterion(range) {
  if (isEmptyRatingRange(range)) {
    return null;
  }
  return {
    value: range.min != null ? Math.round(range.min * 10) : 0,
    value2: range.max != null ? Math.round(range.max * 10) : 100,
    modifier: "BETWEEN",
  };
}

export function describeRatingRange(range) {
  const value = range || {};
  if (value.min != null && value.max != null) {
    return "between " + value.min + " and " + value.max;
  }
  if (value.min != null) {
    return "at least " + value.min;
  }
  if (value.max != null) {
    return "at most " + value.max;
  }
  return "";
}
