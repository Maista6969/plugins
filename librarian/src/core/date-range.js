function normalizeDate(value) {
  if (!value) {
    return null;
  }
  const parts = String(value).split("-");
  const year = (parts[0] || "0000").padStart(4, "0");
  const month = (parts[1] || "01").padStart(2, "0");
  const day = (parts[2] || "01").padStart(2, "0");
  return year + "-" + month + "-" + day;
}

export function isEmptyDateRange(range) {
  return !range || (!range.min && !range.max);
}

// Both bounds are inclusive, same as rating/count ranges, so "in range" and
// "on or after" agree at the boundary rather than one silently excluding it
export function dateInRange(dateValue, range) {
  const date = normalizeDate(dateValue);
  if (date == null || isEmptyDateRange(range)) {
    return false;
  }
  const min = normalizeDate(range.min);
  const max = normalizeDate(range.max);
  if (min != null && date < min) {
    return false;
  }
  if (max != null && date > max) {
    return false;
  }
  return true;
}

// Stash's DateCriterionInput has no open-ended modifier that isn't BETWEEN
// under the hood for a range this shape, so an unset side gets a sentinel far
// enough out to never be the real boundary, mirroring count-range.js's
// UNBOUNDED_MAX
const UNBOUNDED_MIN = "0001-01-01";
const UNBOUNDED_MAX = "9999-12-31";

export function dateRangeCriterion(range) {
  if (isEmptyDateRange(range)) {
    return null;
  }
  return {
    value: range.min || UNBOUNDED_MIN,
    value2: range.max || UNBOUNDED_MAX,
    modifier: "BETWEEN",
  };
}

export function describeDateRange(range) {
  const value = range || {};
  if (value.min && value.max) {
    return "between " + value.min + " and " + value.max;
  }
  if (value.min) {
    return "on or after " + value.min;
  }
  if (value.max) {
    return "on or before " + value.max;
  }
  return "";
}
