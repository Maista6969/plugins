import { likeContains } from "./string-criterion.js";

export const CUSTOM_FIELD_OPS = [
  "EQUALS",
  "NOT_EQUALS",
  "INCLUDES",
  "EXCLUDES",
  "MATCHES_REGEX",
  "NOT_MATCHES_REGEX",
  "GREATER_THAN",
  "LESS_THAN",
  "IS_NULL",
  "NOT_NULL",
];

// The two that ask whether the key is there at all, and so take no value
const PRESENCE_OPS = { IS_NULL: true, NOT_NULL: true };

export function isPresenceOp(op) {
  return !!PRESENCE_OPS[op];
}

export function customFieldsOf(entity) {
  return (entity && entity.customFields) || {};
}

function present(fields, key) {
  return (
    Object.prototype.hasOwnProperty.call(fields, key) && fields[key] != null
  );
}

export function customFieldText(value) {
  if (value == null) {
    return "";
  }
  if (value === true) {
    return "1";
  }
  if (value === false) {
    return "0";
  }
  return String(value);
}

export function numericReading(text) {
  const trimmed = String(text == null ? "" : text).replace(/^\s+|\s+$/g, "");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return isNaN(value) ? null : value;
}

function isStoredNumber(value) {
  return typeof value === "number" || typeof value === "boolean";
}

function asNumber(value) {
  return value === true ? 1 : value === false ? 0 : value;
}

function compareStored(raw, bound) {
  const rawIsNumber = isStoredNumber(raw);
  const boundIsNumber = isStoredNumber(bound);
  if (rawIsNumber !== boundIsNumber) {
    return rawIsNumber ? -1 : 1;
  }
  if (rawIsNumber) {
    const a = asNumber(raw);
    const b = asNumber(bound);
    return a < b ? -1 : a > b ? 1 : 0;
  }
  const a = String(raw);
  const b = String(bound);
  return a < b ? -1 : a > b ? 1 : 0;
}

function equalsStored(raw, text, number) {
  if (isStoredNumber(raw)) {
    return number !== null && asNumber(raw) === number;
  }
  return String(raw) === text;
}

function regexMatches(pattern, text) {
  try {
    return new RegExp(pattern).test(text);
  } catch (e) {
    return false;
  }
}

export function criterionValue(op, value) {
  if (isPresenceOp(op)) {
    return null;
  }
  const text = String(value == null ? "" : value);
  if (text === "") {
    return null;
  }
  const number = numericReading(text);
  if (op === "GREATER_THAN" || op === "LESS_THAN") {
    return [number === null ? text : number];
  }
  // Numeric fields can be stored as either text or numbers,
  // we can't know so we try both
  if (op === "EQUALS" || op === "NOT_EQUALS") {
    return number === null ? [text] : [text, number];
  }
  return [text];
}

function comparisonBound(text) {
  const number = numericReading(text);
  return number === null ? text : number;
}

export function evaluateCustomField(fields, key, op, value) {
  const name = String(key == null ? "" : key);
  if (!name) {
    return false;
  }
  const map = fields || {};
  const found = present(map, name);
  if (isPresenceOp(op)) {
    return op === "IS_NULL" ? !found : found;
  }

  const text = String(value == null ? "" : value);
  if (text === "") {
    // an unfinished condition matches nothing, the same way the server returns
    // nothing for a criterion with no value
    return false;
  }
  const raw = found ? map[name] : null;
  const asText = customFieldText(raw);
  const number = numericReading(text);

  switch (op) {
    case "EQUALS":
      return found && equalsStored(raw, text, number);
    case "NOT_EQUALS":
      return !found || !equalsStored(raw, text, number);
    case "EXCLUDES":
      return !found || !likeContains(asText, text);
    case "MATCHES_REGEX":
      return found && regexMatches(text, asText);
    case "NOT_MATCHES_REGEX":
      return !found || !regexMatches(text, asText);
    case "GREATER_THAN":
      return found && compareStored(raw, comparisonBound(text)) > 0;
    case "LESS_THAN":
      return found && compareStored(raw, comparisonBound(text)) < 0;
    case "INCLUDES":
    default:
      return found && likeContains(asText, text);
  }
}

export function someEntityCustomField(entities, key, op, value) {
  return (entities || []).some((entity) => {
    return evaluateCustomField(customFieldsOf(entity), key, op, value);
  });
}
