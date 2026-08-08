// Stash's GenderEnum and the spellings patterns use for it
//
// The pattern-facing spellings are effectively permanent: they end up in users'
// saved configs, so renaming one later breaks every pattern that used it

const FROM_ENUM = {
  MALE: "male",
  FEMALE: "female",
  TRANSGENDER_MALE: "trans_male",
  TRANSGENDER_FEMALE: "trans_female",
  INTERSEX: "intersex",
  NON_BINARY: "non_binary",
};

export const UNKNOWN_GENDER = "unknown";

export const GENDER_VALUES = [
  "female",
  "male",
  "trans_female",
  "trans_male",
  "intersex",
  "non_binary",
  UNKNOWN_GENDER,
];

const ALIASES = {
  transgender_female: "trans_female",
  transgender_male: "trans_male",
  nonbinary: "non_binary",
  unset: UNKNOWN_GENDER,
  none: UNKNOWN_GENDER,
};

export function normalizeGender(raw) {
  if (!raw) {
    return null;
  }
  const text = String(raw).trim();
  if (!text) {
    return null;
  }
  const fromEnum = FROM_ENUM[text.toUpperCase()];
  return fromEnum || null;
}

export function genderOf(performer) {
  return (performer && performer.gender) || UNKNOWN_GENDER;
}

export function parseGenderValue(raw) {
  const text = String(raw == null ? "" : raw)
    .trim()
    .toLowerCase();
  if (!text) {
    return null;
  }
  const resolved = ALIASES[text] || text;
  return GENDER_VALUES.indexOf(resolved) === -1 ? null : resolved;
}
