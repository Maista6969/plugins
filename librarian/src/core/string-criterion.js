export function evaluateStringCriterion(value, criterion) {
  if (!criterion || !criterion.value) {
    return false;
  }
  const needle = criterion.value;
  const haystack = value || "";
  const modifier = criterion.modifier || "INCLUDES";

  switch (modifier) {
    case "EQUALS":
      return haystack.toLowerCase() === needle.toLowerCase();
    case "NOT_EQUALS":
      return haystack.toLowerCase() !== needle.toLowerCase();
    case "EXCLUDES":
      return haystack.toLowerCase().indexOf(needle.toLowerCase()) === -1;
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
      return haystack.toLowerCase().indexOf(needle.toLowerCase()) !== -1;
  }
}

export function matchesAnyPath(paths, criterion) {
  return (paths || []).some((p) => {
    return evaluateStringCriterion(p, criterion);
  });
}
