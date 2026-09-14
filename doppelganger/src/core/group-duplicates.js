export function groupDuplicateRows(rows) {
  const groups = new Map();

  for (const row of rows) {
    const [stashId, endpoint, id, label, duration] = row;
    // \0 can't appear in a UUID or a URL, so this is a safe, simple
    // composite key without needing a nested Map.
    const key = stashId + "\0" + endpoint;

    if (!groups.has(key)) {
      groups.set(key, { stashId, endpoint, items: [] });
    }
    groups.get(key).items.push({
      id: String(id),
      label,
      // Only the scene query selects a fifth column; the others leave it
      // undefined, which normalises to null.
      duration:
        Number.isFinite(Number(duration)) && duration !== null
          ? Number(duration)
          : null,
    });
  }

  const result = Array.from(groups.values());
  for (const group of result) {
    group.items.sort((a, b) => Number(a.id) - Number(b.id));
  }
  return result;
}

// Two scenes on the same stash-box entry are either the same content in
// different encodes, or different content whose fingerprint was matched to
// the wrong entry. Running time is the cheapest way to tell: re-encodes keep
// it, wrong matches almost never do. Returns the widest gap in seconds, or
// null when fewer than two items have a known duration.
export function durationSpread(items) {
  const known = items
    .map((i) => i.duration)
    .filter((d) => typeof d === "number");
  if (known.length < 2) return null;
  return Math.max(...known) - Math.min(...known);
}
