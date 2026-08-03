function byNameKey(getName) {
  return (a, b) => {
    const ak = (getName(a) || "").toLowerCase();
    const bk = (getName(b) || "").toLowerCase();
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  };
}

export function sortEntities(entities, sortBy, getName) {
  const nameOf =
    getName ||
    ((e) => {
      return e.name;
    });
  const alpha = (entities || []).slice().sort(byNameKey(nameOf));

  if (sortBy === "favorite_first") {
    const favorites = alpha.filter((e) => {
      return !!e.favorite;
    });
    const rest = alpha.filter((e) => {
      return !e.favorite;
    });
    return favorites.concat(rest);
  }

  if (sortBy === "rating") {
    const rated = alpha.filter((e) => {
      return e.rating100 != null;
    });
    const unrated = alpha.filter((e) => {
      return e.rating100 == null;
    });
    rated.sort((a, b) => {
      if (b.rating100 !== a.rating100) {
        return b.rating100 - a.rating100;
      }
      return byNameKey(nameOf)(a, b);
    });
    return rated.concat(unrated);
  }

  // "alphabetical" (the default), and the safe fallback for any unknown value.
  return alpha;
}
