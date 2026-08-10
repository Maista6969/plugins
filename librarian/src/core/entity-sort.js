// Sorting is an ordered list of criteria applied one after another
// ["favorite", "rating"] means "favourites first, best-rated first among them"
//
// TOTALITY INVARIANT: the result is the same for the same set of entities no
// matter what order they arrived in, for any criteria list. That is why "name"
// and then "id" are always appended as final tiebreakers, whether or not the
// user picked them. Renames have to be idempotent and a sort that leaves two
// entities in arbitrary relative order would let {performers|limit=1} choose
// differently between two runs and shuffle files back and forth forever

export const SORT_CRITERIA = ["favorite", "rating", "name"];

// What the three original single-value settings mean as criteria lists
const LEGACY_SORT_BY = {
  alphabetical: [],
  favorite_first: ["favorite"],
  rating: ["rating"],
};

export const DEFAULT_SORT_CRITERIA = ["name"];

export function normalizeSortCriteria(value) {
  let raw;
  if (Array.isArray(value)) {
    raw = value;
  } else if (typeof value === "string" && LEGACY_SORT_BY[value]) {
    raw = LEGACY_SORT_BY[value];
  } else {
    raw = [];
  }

  const criteria = [];
  raw.forEach((name) => {
    if (SORT_CRITERIA.indexOf(name) !== -1 && criteria.indexOf(name) === -1) {
      criteria.push(name);
    }
  });
  if (criteria.indexOf("name") === -1) {
    criteria.push("name");
  }
  return criteria;
}

function compareName(a, b, nameOf) {
  const ak = (nameOf(a) || "").toLowerCase();
  const bk = (nameOf(b) || "").toLowerCase();
  return ak < bk ? -1 : ak > bk ? 1 : 0;
}

const COMPARATORS = {
  favorite: (a, b) => {
    return (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0);
  },
  // higher first, and unrated last. rating100 of 0 is a rating; null is not
  rating: (a, b) => {
    const ar = a.rating100 == null ? null : a.rating100;
    const br = b.rating100 == null ? null : b.rating100;
    if (ar == null && br == null) {
      return 0;
    }
    if (ar == null) {
      return 1;
    }
    if (br == null) {
      return -1;
    }
    return br - ar;
  },
  name: compareName,
};

export function describeSortCriteria(value) {
  const criteria = normalizeSortCriteria(value);
  const parts = criteria.map((name) => {
    if (name === "favorite") return "favourites first";
    if (name === "rating") return "highest-rated first";
    return "alphabetically";
  });
  if (parts.length === 1) {
    return "Sorted " + parts[0] + ".";
  }
  return (
    "Sorted " +
    parts.slice(0, -1).join(", ") +
    ", then " +
    parts[parts.length - 1] +
    "."
  );
}

export function sortEntities(entities, sortBy, getName) {
  const nameOf =
    getName ||
    ((e) => {
      return e.name;
    });
  const criteria = normalizeSortCriteria(sortBy);

  return (entities || []).slice().sort((a, b) => {
    for (let i = 0; i < criteria.length; i++) {
      const comparator = COMPARATORS[criteria[i]];
      const result =
        criteria[i] === "name" ? comparator(a, b, nameOf) : comparator(a, b);
      if (result !== 0) {
        return result;
      }
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
