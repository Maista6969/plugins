import { walkStudioChain } from "./studio-hierarchy.js";
import { adapterFor } from "./entity-adapter.js";
import { normalizeGender } from "./gender.js";

function byKey(getKey) {
  return (a, b) => {
    const ak = getKey(a).toLowerCase();
    const bk = getKey(b).toLowerCase();
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  };
}

function performerKey(p) {
  return p.name || "";
}

// Tags have their own sort order now
function tagKey(t) {
  return t.sort_name || t.name || "";
}

export function normalizeScene(rawScene, entityType) {
  const adapter = adapterFor(entityType);
  const studioChain = walkStudioChain(rawScene.studio);
  const performers = (rawScene.performers || [])
    .slice()
    .sort(byKey(performerKey));
  const tags = (rawScene.tags || []).slice().sort(byKey(tagKey));
  // Stash does not order a scenes groups (SceneStore.GetGroups runs no ORDER
  // BY), so the pick has to be ours or {group} would vary between runs. Lowest
  // id first means the group created earliest wins, which is stable and does
  // not move when a group is renamed
  const groups = (rawScene.groups || [])
    .filter((g) => {
      return g && g.group;
    })
    .map((g) => {
      return {
        id: String(g.group.id),
        name: g.group.name || "",
        // nullable in the schema: a scene can be in a group with no place in
        // its running order, which is missing data rather than index 0
        sceneIndex: g.scene_index == null ? null : g.scene_index,
      };
    })
    .sort((a, b) => {
      const an = parseInt(a.id, 10);
      const bn = parseInt(b.id, 10);
      if (!isNaN(an) && !isNaN(bn) && an !== bn) {
        return an - bn;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  return {
    id: rawScene.id,
    title: rawScene.title || "",
    code: rawScene.code || "",
    date: rawScene.date || "",
    organized: !!rawScene.organized,
    rating100: rawScene.rating100 != null ? rawScene.rating100 : null,
    customFields: rawScene.custom_fields || {},
    hasStashId: !!(rawScene.stash_ids && rawScene.stash_ids.length > 0),
    stashIds: (rawScene.stash_ids || []).map((s) => {
      return { endpoint: s.endpoint || "", stash_id: s.stash_id || "" };
    }),
    studioNames: studioChain.map((s) => {
      return s.name;
    }),
    studioIds: studioChain.map((s) => {
      return s.id;
    }),
    performers: performers.map((p) => {
      return {
        id: String(p.id),
        name: p.name,
        favorite: !!p.favorite,
        rating100: p.rating100 != null ? p.rating100 : null,
        gender: normalizeGender(p.gender),
        customFields: p.custom_fields || {},
      };
    }),
    tags: tags.map((t) => {
      return { id: String(t.id), name: t.name };
    }),
    groups: groups,
    performerNames: performers.map((p) => {
      return p.name;
    }),
    performerIds: performers.map((p) => {
      return String(p.id);
    }),
    tagNames: tags.map((t) => {
      return t.name;
    }),
    tagIds: tags.map((t) => {
      return String(t.id);
    }),
    files: adapter.files(rawScene),
  };
}
