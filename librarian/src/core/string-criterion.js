// SQLite's LIKE folds A-Z only, so "BJÖRK" is not matched by "björk"
function asciiLower(text) {
  return String(text).replace(/[A-Z]/g, (c) => {
    return c.toLowerCase();
  });
}

// LIKE, iteratively: "%" matches any run of characters and "_" exactly one
// Deliberately not compiled to a RegExp, which would mean building one per file
// per condition on every sweep, in a VM where that is not cheap
function likeMatches(text, pattern) {
  let t = 0;
  let p = 0;
  let starPattern = -1;
  let starText = 0;
  while (t < text.length) {
    const pc = p < pattern.length ? pattern.charAt(p) : "";
    if (p < pattern.length && (pc === "_" || pc === text.charAt(t))) {
      t++;
      p++;
    } else if (p < pattern.length && pc === "%") {
      // remember where to resume: "%" may still need to swallow more
      starPattern = p;
      starText = t;
      p++;
    } else if (starPattern !== -1) {
      p = starPattern + 1;
      starText++;
      t = starText;
    } else {
      return false;
    }
  }
  while (p < pattern.length && pattern.charAt(p) === "%") {
    p++;
  }
  return p === pattern.length;
}

export function pathSearchTerms(value) {
  const trimmed = String(value == null ? "" : value).replace(/^\s+|\s+$/g, "");
  const unquoted = trimmed.replace(/^"+|"+$/g, "");
  if (unquoted !== trimmed) {
    return [unquoted];
  }
  const words = trimmed.split(/\s+/).filter((word) => {
    return word !== "";
  });
  return words.length > 0 ? words : [""];
}

function matchesAnyTerm(haystack, value) {
  const text = asciiLower(haystack);
  return pathSearchTerms(value).some((term) => {
    return likeMatches(text, "%" + asciiLower(term) + "%");
  });
}

// EQUALS is the one comparison Stash does not wrap in wildcards or split
function matchesWhole(haystack, value) {
  return likeMatches(asciiLower(haystack), asciiLower(value));
}

export function evaluateStringCriterion(value, criterion) {
  if (!criterion || !criterion.value) {
    return false;
  }
  const needle = criterion.value;
  const haystack = value || "";
  const modifier = criterion.modifier || "INCLUDES";

  switch (modifier) {
    case "EQUALS":
      return matchesWhole(haystack, needle);
    case "NOT_EQUALS":
      return !matchesWhole(haystack, needle);
    case "EXCLUDES":
      return !matchesAnyTerm(haystack, needle);
    case "MATCHES_REGEX":
      try {
        return new RegExp(needle).test(haystack);
      } catch (e) {
        return false;
      }
    case "NOT_MATCHES_REGEX":
      try {
        return !new RegExp(needle).test(haystack);
      } catch (e) {
        return false;
      }
    case "INCLUDES":
    default:
      return matchesAnyTerm(haystack, needle);
  }
}

export function matchesAnyPath(paths, criterion) {
  return (paths || []).some((p) => {
    return evaluateStringCriterion(p, criterion);
  });
}
