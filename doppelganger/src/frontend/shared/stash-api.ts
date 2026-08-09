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

// All three detection queries share the same shape: join <entity>_stash_ids
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
const SCENE_DUPES_SQL = `
  SELECT st.stash_id, st.endpoint, s.id, s.title
  FROM scene_stash_ids st
  JOIN scenes s ON s.id = st.scene_id
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

const STUDIO_DUPES_SQL = `
  SELECT st.stash_id, st.endpoint, s.id, s.name
  FROM studio_stash_ids st
  JOIN studios s ON s.id = st.studio_id
  JOIN (
    SELECT stash_id, endpoint FROM studio_stash_ids GROUP BY stash_id, endpoint HAVING COUNT(*) > 1
  ) dupes ON dupes.stash_id = st.stash_id AND dupes.endpoint = st.endpoint
  ORDER BY st.stash_id, st.endpoint, s.id
`;

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

export function findDuplicateStudios(client: any) {
  return runDuplicateQuery(client, STUDIO_DUPES_SQL);
}

const SCENE_MERGE_MUTATION = gql`
  mutation DoppelgangerSceneMerge($source: [ID!]!, $destination: ID!) {
    sceneMerge(input: { source: $source, destination: $destination }) {
      id
    }
  }
`;

// `sceneMerge` returns a nullable Scene (confirmed via
// graphql/schema/schema.graphql: `sceneMerge(input: SceneMergeInput!): Scene`,
// no `!`) -- callers should treat a null-but-no-error result the same as
// success, same as this function does by simply not inspecting the return
// value beyond letting a thrown GraphQL error propagate.
export async function mergeScenes(client: any, source: string[], destination: string) {
  await client.mutate({
    mutation: SCENE_MERGE_MUTATION,
    variables: { source, destination },
  });
}

const PERFORMER_MERGE_MUTATION = gql`
  mutation DoppelgangerPerformerMerge($source: [ID!]!, $destination: ID!) {
    performerMerge(input: { source: $source, destination: $destination }) {
      id
    }
  }
`;

export async function mergePerformers(client: any, source: string[], destination: string) {
  await client.mutate({
    mutation: PERFORMER_MERGE_MUTATION,
    variables: { source, destination },
  });
}
