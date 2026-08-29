export function isEmptyCountRange(range) {
  return !range || (range.min == null && range.max == null);
}

export function countInRange(count, range) {
  if (count == null || isEmptyCountRange(range)) {
    return false;
  }
  const min = range.min != null ? range.min : null;
  const max = range.max != null ? range.max : null;
  if (min != null && count < min) {
    return false;
  }
  if (max != null && count > max) {
    return false;
  }
  return true;
}

const UNBOUNDED_MAX = Number.MAX_SAFE_INTEGER;

export function countRangeCriterion(range) {
  if (isEmptyCountRange(range)) {
    return null;
  }
  return {
    value: range.min != null ? Math.round(range.min) : 0,
    value2: range.max != null ? Math.round(range.max) : UNBOUNDED_MAX,
    modifier: "BETWEEN",
  };
}

export function describeCountRange(range) {
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
