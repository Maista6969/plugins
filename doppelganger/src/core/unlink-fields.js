// When a scene was matched to the wrong stash-box entry, the metadata that
// came with the match is wrong too, but Stash does not record which fields a
// scrape wrote. The next best signal is agreement: a field whose value is
// identical on the wrongly matched scene and on another scene sharing the
// same stash ID almost certainly came from that entry. Those are proposed
// for clearing; the user confirms.

export const CLEARABLE_FIELDS = [
  { key: "title", label: "Title" },
  { key: "date", label: "Date" },
  { key: "details", label: "Details" },
  { key: "urls", label: "URLs" },
  { key: "studio", label: "Studio" },
  { key: "performers", label: "Performers" },
  { key: "tags", label: "Tags" },
];

function normalise(field, scene) {
  switch (field) {
    case "title":
    case "date":
    case "details":
      return scene[field] || "";
    case "urls":
      return (scene.urls || []).slice().sort().join("\n");
    case "studio":
      return scene.studio?.id || "";
    case "performers":
    case "tags":
      return (scene[field] || [])
        .map((x) => x.id)
        .sort()
        .join(",");
    default:
      return "";
  }
}

function isEmpty(field, scene) {
  return normalise(field, scene) === "";
}

// Returns the keys of the fields that are set on `target` and identical to
// the same field on at least one of `others`.
export function fieldsSharedWithOthers(target, others) {
  return CLEARABLE_FIELDS.map((f) => f.key).filter((key) => {
    if (isEmpty(key, target)) return false;
    const value = normalise(key, target);
    return others.some((o) => normalise(key, o) === value);
  });
}

// The SceneUpdateInput that clears the chosen fields and drops one stash ID.
export function buildUnlinkInput(scene, endpoint, stashId, clearKeys) {
  const clear = new Set(clearKeys);
  const input = {
    id: scene.id,
    stash_ids: (scene.stash_ids || [])
      .filter((s) => !(s.endpoint === endpoint && s.stash_id === stashId))
      .map((s) => ({ endpoint: s.endpoint, stash_id: s.stash_id })),
  };
  if (clear.has("title")) input.title = "";
  if (clear.has("date")) input.date = null;
  if (clear.has("details")) input.details = "";
  if (clear.has("urls")) input.urls = [];
  if (clear.has("studio")) input.studio_id = null;
  if (clear.has("performers")) input.performer_ids = [];
  if (clear.has("tags")) input.tag_ids = [];
  return input;
}
