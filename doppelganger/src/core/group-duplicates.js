export function groupDuplicateRows(rows) {
  const groups = new Map();

  for (const row of rows) {
    const [stashId, endpoint, id, label] = row;
    // \0 can't appear in a UUID or a URL, so this is a safe, simple
    // composite key without needing a nested Map.
    const key = stashId + "\0" + endpoint;

    if (!groups.has(key)) {
      groups.set(key, { stashId, endpoint, items: [] });
    }
    groups.get(key).items.push({ id: String(id), label });
  }

  const result = Array.from(groups.values());
  for (const group of result) {
    group.items.sort((a, b) => Number(a.id) - Number(b.id));
  }
  return result;
}
