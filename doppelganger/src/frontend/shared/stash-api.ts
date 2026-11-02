import { gql } from "@apollo/client";
import { groupDuplicateRows } from "../../core/group-duplicates.js";
import { groupSceneFileRows } from "../../core/multi-file-scenes.js";

const QUERY_SQL = gql`
  mutation DoppelgangerQuerySQL($sql: String!) {
    querySQL(sql: $sql) {
      columns
      rows
    }
  }
`;

// All four detection queries share the same shape: join <entity>_stash_ids
// against itself (grouped by stash_id+endpoint, HAVING count > 1) to find
// only stash_ids that are genuinely duplicated, then join back to the real
// entity table for a human-readable label. The subquery joins the entity table
// too: stash_id rows can outlive their entity (left behind while foreign keys
// were unenforced), and counting those yields one-item groups whose sibling
// no longer exists. Confirmed via Stash's own source
// (pkg/sqlite/migrations/14_stash_box_ids.up.sql, 34_indexes.up.sql):
// performer_stash_ids/studio_stash_ids have no unique constraint at the DB
// level (unlike scene_stash_ids, which got a composite PRIMARY KEY in
// migration 35), so duplicates there are entirely possible and worth
// surfacing. Column order is fixed (stash_id, endpoint, id, label) to match
// group-duplicates.js's row-tuple destructuring -- no dynamic column-name
// lookup needed since this plugin controls the exact SELECT list.

// Duplicate scenes are near-always identically titled -- they were matched
// against the same stash-box entry, so the title came from the same place.
// The file path is the only thing that actually tells them apart, so that is
// what gets listed. Falls back to the title, then to nothing, for scenes with
// no file (the caller renders #id in that case). The primary file's running
// time rides along as a fifth column: see durationSpread in
// group-duplicates.js for what it is used for.
const SCENE_DUPES_SQL = `
  SELECT st.stash_id, st.endpoint, s.id,
         COALESCE(fo.path || '/' || fi.basename, s.title, '') AS label,
         vf.duration
  FROM scene_stash_ids st
  JOIN scenes s ON s.id = st.scene_id
  LEFT JOIN scenes_files sf ON sf.scene_id = s.id AND sf.\`primary\` = 1
  LEFT JOIN files fi ON fi.id = sf.file_id
  LEFT JOIN folders fo ON fo.id = fi.parent_folder_id
  LEFT JOIN video_files vf ON vf.file_id = fi.id
  JOIN (
    SELECT x.stash_id, x.endpoint FROM scene_stash_ids x
    JOIN scenes ON scenes.id = x.scene_id
    GROUP BY x.stash_id, x.endpoint HAVING COUNT(*) > 1
  ) dupes ON dupes.stash_id = st.stash_id AND dupes.endpoint = st.endpoint
  ORDER BY st.stash_id, st.endpoint, s.id
`;

const PERFORMER_DUPES_SQL = `
  SELECT st.stash_id, st.endpoint, p.id, p.name
  FROM performer_stash_ids st
  JOIN performers p ON p.id = st.performer_id
  JOIN (
    SELECT x.stash_id, x.endpoint FROM performer_stash_ids x
    JOIN performers ON performers.id = x.performer_id
    GROUP BY x.stash_id, x.endpoint HAVING COUNT(*) > 1
  ) dupes ON dupes.stash_id = st.stash_id AND dupes.endpoint = st.endpoint
  ORDER BY st.stash_id, st.endpoint, p.id
`;

const TAG_DUPES_SQL = `
  SELECT st.stash_id, st.endpoint, t.id, t.name
  FROM tag_stash_ids st
  JOIN tags t ON t.id = st.tag_id
  JOIN (
    SELECT x.stash_id, x.endpoint FROM tag_stash_ids x
    JOIN tags ON tags.id = x.tag_id
    GROUP BY x.stash_id, x.endpoint HAVING COUNT(*) > 1
  ) dupes ON dupes.stash_id = st.stash_id AND dupes.endpoint = st.endpoint
  ORDER BY st.stash_id, st.endpoint, t.id
`;

const STUDIO_DUPES_SQL = `
  SELECT st.stash_id, st.endpoint, s.id, s.name
  FROM studio_stash_ids st
  JOIN studios s ON s.id = st.studio_id
  JOIN (
    SELECT x.stash_id, x.endpoint FROM studio_stash_ids x
    JOIN studios ON studios.id = x.studio_id
    GROUP BY x.stash_id, x.endpoint HAVING COUNT(*) > 1
  ) dupes ON dupes.stash_id = st.stash_id AND dupes.endpoint = st.endpoint
  ORDER BY st.stash_id, st.endpoint, s.id
`;

// Every file of every scene holding more than one. A scan only attaches a
// file to an existing scene when its oshash or MD5 matches one already there
// (pkg/scene/scan.go's matchableFingerprintTypes), which yields byte-identical
// copies; a merge moves all of the source scenes' files across, which yields
// alternate encodes. The oshash rides along so the two can be told apart.
// Column order matches multi-file-scenes.js.
const MULTI_FILE_SCENES_SQL = `
  SELECT sf.scene_id, s.title, fi.id, sf.\`primary\`,
         fo.path || '/' || fi.basename, fi.size, fi.mod_time,
         vf.width, vf.height, vf.bit_rate, vf.video_codec, vf.duration,
         fp.fingerprint
  FROM scenes_files sf
  JOIN scenes s ON s.id = sf.scene_id
  JOIN files fi ON fi.id = sf.file_id
  JOIN folders fo ON fo.id = fi.parent_folder_id
  LEFT JOIN video_files vf ON vf.file_id = fi.id
  LEFT JOIN files_fingerprints fp ON fp.file_id = fi.id AND fp.type = 'oshash'
  WHERE sf.scene_id IN (
    SELECT scene_id FROM scenes_files GROUP BY scene_id HAVING COUNT(*) > 1
  )
  ORDER BY sf.scene_id, sf.\`primary\` DESC, fi.id
`;

const CONFIGURATION_QUERY = gql`
  query DoppelgangerGetConfiguration {
    configuration {
      general {
        stashBoxes {
          name
          endpoint
        }
      }
    }
  }
`;

export interface StashBoxSummary {
  name: string;
  endpoint: string;
}

export async function fetchStashBoxes(client: any): Promise<StashBoxSummary[]> {
  const { data } = await client.query({
    query: CONFIGURATION_QUERY,
    fetchPolicy: "no-cache",
  });
  return data?.configuration?.general?.stashBoxes || [];
}

// Endpoints are an implementation detail -- nothing else in the Stash UI shows
// them, so fall back to the raw endpoint only when it is not a configured box
// (which happens when a box has been removed but its stash_ids remain).
export function stashBoxLabel(endpoint: string, stashBoxes: StashBoxSummary[]) {
  return stashBoxes.find((b) => b.endpoint === endpoint)?.name || endpoint;
}

async function runDuplicateQuery(client: any, sql: string) {
  const { data } = await client.mutate({
    mutation: QUERY_SQL,
    variables: { sql },
  });
  const rows = (data && data.querySQL && data.querySQL.rows) || [];
  return groupDuplicateRows(rows);
}

export function findDuplicateScenes(client: any) {
  return runDuplicateQuery(client, SCENE_DUPES_SQL);
}

export function findDuplicatePerformers(client: any) {
  return runDuplicateQuery(client, PERFORMER_DUPES_SQL);
}

export function findDuplicateTags(client: any) {
  return runDuplicateQuery(client, TAG_DUPES_SQL);
}

export function findDuplicateStudios(client: any) {
  return runDuplicateQuery(client, STUDIO_DUPES_SQL);
}

export async function findMultiFileScenes(client: any) {
  const { data } = await client.mutate({
    mutation: QUERY_SQL,
    variables: { sql: MULTI_FILE_SCENES_SQL },
  });
  return groupSceneFileRows(data?.querySQL?.rows ?? []);
}

// Kept separate from CONFIGURATION_QUERY: the field only exists on newer
// Stash builds, and an unknown field fails the whole query. `undefined` means
// this Stash has no trash feature, "" means it has one but it is disabled.
const TRASH_PATH_QUERY = gql`
  query DoppelgangerTrashPath {
    configuration {
      general {
        deleteTrashPath
      }
    }
  }
`;

export async function fetchDeleteTrashPath(
  client: any,
): Promise<string | undefined> {
  try {
    const { data } = await client.query({
      query: TRASH_PATH_QUERY,
      fetchPolicy: "no-cache",
    });
    return data?.configuration?.general?.deleteTrashPath ?? "";
  } catch {
    return undefined;
  }
}

const SET_PRIMARY_FILE = gql`
  mutation DoppelgangerSetPrimaryFile($id: ID!, $fileId: ID!) {
    sceneUpdate(input: { id: $id, primary_file_id: $fileId }) {
      id
    }
  }
`;

// Stash refuses to delete a primary file server-side
// (internal/api/resolver_mutation_file.go), so a plan that keeps a non-primary
// copy promotes it first. The files go through Stash's own deleter, which
// honours the configured trash path.
const DELETE_FILES = gql`
  mutation DoppelgangerDeleteFiles($ids: [ID!]!) {
    deleteFiles(ids: $ids)
  }
`;

export interface CopyDeletionPlan {
  sceneId: string;
  setPrimaryFileId: string | null;
  deleteFileIds: string[];
}

export async function executeCopyDeletion(client: any, plan: CopyDeletionPlan) {
  if (plan.setPrimaryFileId) {
    await client.mutate({
      mutation: SET_PRIMARY_FILE,
      variables: { id: plan.sceneId, fileId: plan.setPrimaryFileId },
    });
  }
  if (plan.deleteFileIds.length) {
    await client.mutate({
      mutation: DELETE_FILES,
      variables: { ids: plan.deleteFileIds },
    });
  }
}

// Seed data for Stash's own merge modals. Both modals re-query full records
// themselves once the user picks a destination, so these only need to cover
// what the first step renders. Scenes need no query at all -- the detection
// query already resolved everything the scene modal displays.

// Mirrors the Tag type TagMergeModal types its `tags` prop against
// (Pick<GQL.Tag, "id" | "name" | "sort_name" | "aliases" | "image_path" |
// "stash_ids">, exported from TagSelect).
export const TAGS_FOR_MERGE = gql`
  query DoppelgangerTagsForMerge($ids: [ID!]) {
    findTags(ids: $ids, filter: { per_page: -1 }) {
      tags {
        id
        name
        sort_name
        aliases
        image_path
        stash_ids {
          stash_id
          endpoint
        }
      }
    }
  }
`;

// Stash's stash-box source only takes a fingerprint lookup or a free-text
// query, but a stash-box resolves a scene ID passed as the query to that
// exact scene (pkg/stashbox/scene.go QueryScene -> searchScene). A non-ID
// query would be a text search, so only ID-shaped values are sent, and the
// result is trusted only when it echoes the ID back.
const STASH_BOX_SCENE_QUERY = gql`
  query DoppelgangerStashBoxScene($endpoint: String!, $query: String!) {
    scrapeSingleScene(
      source: { stash_box_endpoint: $endpoint }
      input: { query: $query }
    ) {
      remote_site_id
      duration
    }
  }
`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const stashBoxDurations = new Map<string, Promise<number | null>>();

// The entry's running time in seconds, or null when the box has none, the
// lookup fails (no API key, box offline), or the ID is not one a box would
// resolve. Cached for the page's lifetime: every group asks once.
export function fetchStashBoxDuration(
  client: any,
  endpoint: string,
  stashId: string,
): Promise<number | null> {
  if (!UUID.test(stashId)) return Promise.resolve(null);
  const key = endpoint + "\0" + stashId;
  let pending = stashBoxDurations.get(key);
  if (!pending) {
    pending = client
      .query({
        query: STASH_BOX_SCENE_QUERY,
        variables: { endpoint, query: stashId },
        fetchPolicy: "no-cache",
      })
      .then(({ data }: any) => {
        const scene = (data?.scrapeSingleScene ?? []).find(
          (s: any) => s.remote_site_id === stashId,
        );
        const duration = scene?.duration;
        return typeof duration === "number" ? duration : null;
      })
      .catch(() => null);
    stashBoxDurations.set(key, pending!);
  }
  return pending!;
}

// What the post-merge file chooser shows for each file; Stash returns a
// scene's files primary first.
export const SCENE_FILES = gql`
  query DoppelgangerSceneFiles($id: ID!) {
    findScene(id: $id) {
      id
      files {
        id
        path
        size
        width
        height
        duration
        video_codec
      }
    }
  }
`;

// Every field the unlink dialog can clear, plus the stash IDs it edits.
export const SCENES_FOR_UNLINK = gql`
  query DoppelgangerScenesForUnlink($ids: [ID!]) {
    findScenes(ids: $ids, filter: { per_page: -1 }) {
      scenes {
        id
        title
        date
        details
        urls
        studio {
          id
        }
        performers {
          id
        }
        tags {
          id
        }
        stash_ids {
          endpoint
          stash_id
        }
      }
    }
  }
`;

const SCENE_UPDATE = gql`
  mutation DoppelgangerSceneUpdate($input: SceneUpdateInput!) {
    sceneUpdate(input: $input) {
      id
    }
  }
`;

export async function updateScene(client: any, input: Record<string, unknown>) {
  await client.mutate({ mutation: SCENE_UPDATE, variables: { input } });
}

// Mirrors Stash's SelectPerformerData fragment, which is what
// PerformerMergeModal types its `performers` prop against.
export const PERFORMERS_FOR_MERGE = gql`
  query DoppelgangerPerformersForMerge($ids: [ID!]) {
    findPerformers(ids: $ids, filter: { per_page: -1 }) {
      performers {
        id
        name
        disambiguation
        alias_list
        image_path
        birthdate
        death_date
      }
    }
  }
`;
