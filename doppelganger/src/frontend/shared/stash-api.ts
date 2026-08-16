import { gql } from "@apollo/client";
import { groupDuplicateRows } from "../../core/group-duplicates.js";

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
// entity table for a human-readable label. Confirmed via Stash's own source
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
// no file (the caller renders #id in that case).
const SCENE_DUPES_SQL = `
  SELECT st.stash_id, st.endpoint, s.id,
         COALESCE(fo.path || '/' || fi.basename, s.title, '') AS label
  FROM scene_stash_ids st
  JOIN scenes s ON s.id = st.scene_id
  LEFT JOIN scenes_files sf ON sf.scene_id = s.id AND sf.\`primary\` = 1
  LEFT JOIN files fi ON fi.id = sf.file_id
  LEFT JOIN folders fo ON fo.id = fi.parent_folder_id
  JOIN (
    SELECT stash_id, endpoint FROM scene_stash_ids GROUP BY stash_id, endpoint HAVING COUNT(*) > 1
  ) dupes ON dupes.stash_id = st.stash_id AND dupes.endpoint = st.endpoint
  ORDER BY st.stash_id, st.endpoint, s.id
`;

const PERFORMER_DUPES_SQL = `
  SELECT st.stash_id, st.endpoint, p.id, p.name
  FROM performer_stash_ids st
  JOIN performers p ON p.id = st.performer_id
  JOIN (
    SELECT stash_id, endpoint FROM performer_stash_ids GROUP BY stash_id, endpoint HAVING COUNT(*) > 1
  ) dupes ON dupes.stash_id = st.stash_id AND dupes.endpoint = st.endpoint
  ORDER BY st.stash_id, st.endpoint, p.id
`;

const TAG_DUPES_SQL = `
  SELECT st.stash_id, st.endpoint, t.id, t.name
  FROM tag_stash_ids st
  JOIN tags t ON t.id = st.tag_id
  JOIN (
    SELECT stash_id, endpoint FROM tag_stash_ids GROUP BY stash_id, endpoint HAVING COUNT(*) > 1
  ) dupes ON dupes.stash_id = st.stash_id AND dupes.endpoint = st.endpoint
  ORDER BY st.stash_id, st.endpoint, t.id
`;

const STUDIO_DUPES_SQL = `
  SELECT st.stash_id, st.endpoint, s.id, s.name
  FROM studio_stash_ids st
  JOIN studios s ON s.id = st.studio_id
  JOIN (
    SELECT stash_id, endpoint FROM studio_stash_ids GROUP BY stash_id, endpoint HAVING COUNT(*) > 1
  ) dupes ON dupes.stash_id = st.stash_id AND dupes.endpoint = st.endpoint
  ORDER BY st.stash_id, st.endpoint, s.id
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
