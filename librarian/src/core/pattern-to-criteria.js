// Turns "what the default pattern needs" into Stash list-filter criteria, so a
// user can narrow the Scenes page to items Librarian can actually rename
// instead of a page full of Skipped rows.
//
// This is deliberately an approximation, and it is worth being precise about
// why. A filter in the URL is a flat AND of the list's own criteria: Stash's
// ListFilterModel.makeFilter() merges each criterion into a single object, so
// there is no NOT and no OR to compose with, even though SceneFilterType itself
// has both. Everything that needs negating a group therefore cannot be
// expressed here:
//
//   exclusions written with AND logic   NOT(A AND B) needs an OR
//   a negated rating range              < min OR > max
//   "no earlier rule matched"           the general case of the above
//   anything only rendering can tell    unstable patterns, empty filenames
//
// What is left still removes the common causes, which are the ones filling the
// page: not organized, no StashID, no files, and no data for a token the
// pattern requires.

import { scanPattern } from "./token-grammar.js";

// The criterion that selects items which DO have what a token needs, keyed by
// the token, so the set follows from the pattern rather than being a second
// list to keep in step with it.
//
// Deliberately absent:
//   matched_performers, matched_tags  answer to a rule's own conditions, not to
//                                     the default pattern
//   the file-tech tokens              always present once a file is, which
//                                     file_count already covers
//   current                           every file has a path
//   custom_field                      a list filter is a flat AND of criteria
//                                     keyed by type, so two {@...} tokens in
//                                     one pattern would need two custom_fields
//                                     criteria and only one could survive
const TOKEN_CRITERIA = {
  studio: { type: "studios", modifier: "NOT_NULL" },
  studio_root: { type: "studios", modifier: "NOT_NULL" },
  studio_hierarchy: { type: "studios", modifier: "NOT_NULL" },
  performers: { type: "performers", modifier: "NOT_NULL" },
  performers_not_in_title: { type: "performers", modifier: "NOT_NULL" },
  tags: { type: "tags", modifier: "NOT_NULL" },
  title: { type: "title", modifier: "NOT_NULL" },
  code: { type: "code", modifier: "NOT_NULL" },
  director: { type: "director", modifier: "NOT_NULL" },
  date: { type: "date", modifier: "NOT_NULL" },
  // a partial date still satisfies "has a date"; that {date_day} needs a full
  // one is not something the filter can ask for
  date_year: { type: "date", modifier: "NOT_NULL" },
  date_month: { type: "date", modifier: "NOT_NULL" },
  date_day: { type: "date", modifier: "NOT_NULL" },
  rating: { type: "rating100", modifier: "NOT_NULL" },
  group: { type: "groups", modifier: "NOT_NULL" },
  // Scene can be in a group without having an index in that group
  group_idx: { type: "groups", modifier: "NOT_NULL" },
  stash_id: { type: "stash_id_count", modifier: "GREATER_THAN", value: 0 },
};

function keyOf(criterion) {
  return criterion.type + "|" + criterion.modifier;
}

// Only a required token gates anything: {title?} renders empty rather than
// reporting missing data, so a scene without one is not skipped for it. This is
// the same test findMissingRequiredData applies
export function requiredTokenCriteria(patterns) {
  const found = [];
  const seen = {};
  (patterns || []).forEach((pattern) => {
    scanPattern(pattern).forEach((token) => {
      if (token.optional || token.errors.length > 0) {
        return;
      }
      const criterion = TOKEN_CRITERIA[token.name];
      if (!criterion || seen[keyOf(criterion)]) {
        return;
      }
      seen[keyOf(criterion)] = true;
      found.push(criterion);
    });
  });
  return found;
}

// Everything the default pattern needs, as criteria: the config's own gates,
// a file to rename, and data for every required token
export function defaultPatternCriteria(settings) {
  const config = settings || {};
  const pattern = config.defaultPattern || {};
  const criteria = [];

  if (config.onlyOrganized) {
    criteria.push({ type: "organized", value: "true" });
  }
  if (config.onlyWithStashId) {
    criteria.push({
      type: "stash_id_count",
      modifier: "GREATER_THAN",
      value: 0,
    });
  }
  // nothing to rename without one, and the planner skips these as no_files
  criteria.push({ type: "file_count", modifier: "GREATER_THAN", value: 0 });

  const seen = {};
  criteria.forEach((c) => {
    seen[keyOf(c)] = true;
  });
  requiredTokenCriteria([
    pattern.folderPattern,
    pattern.filenamePattern,
  ]).forEach((c) => {
    if (!seen[keyOf(c)]) {
      seen[keyOf(c)] = true;
      criteria.push(c);
    }
  });

  return criteria;
}

// What the filter cannot speak for, so the button can say so rather than
// implying the page it produces is free of skips. Returns stable keys rather
// than display text: this module has no access to the UI's translations, so
// the caller (RenamableFilterButton) maps each key to localized text
export function criteriaGaps(settings) {
  const config = settings || {};
  const gaps = [];
  const exclusions = config.excludeConditions || {};
  if ((exclusions.conditions || []).length > 0) {
    gaps.push("exclusions");
  }
  if ((config.rules || []).some((r) => r && r.enabled !== false)) {
    gaps.push("claimed_by_rule");
  }
  return gaps;
}
