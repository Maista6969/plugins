import { gql } from "@apollo/client";
import { PLUGIN_ID, normalizeConfig } from "../../core/config-schema.js";

const CONFIGURATION_QUERY = gql`
  query LibrarianGetConfiguration($include: [ID!]) {
    configuration {
      plugins(include: $include)
      general {
        stashes {
          path
          excludeVideo
        }
        stashBoxes {
          name
          endpoint
        }
      }
    }
  }
`;

const CONFIGURE_PLUGIN_MUTATION = gql`
  mutation LibrarianConfigurePlugin($plugin_id: ID!, $input: Map!) {
    configurePlugin(plugin_id: $plugin_id, input: $input)
  }
`;

const RUN_PLUGIN_TASK_MUTATION = gql`
  mutation LibrarianRunTask(
    $plugin_id: ID!
    $task_name: String
    $args_map: Map
  ) {
    runPluginTask(
      plugin_id: $plugin_id
      task_name: $task_name
      args_map: $args_map
    )
  }
`;

const PLUGINS_QUERY = gql`
  query LibrarianGetPlugins {
    plugins {
      id
      name
    }
  }
`;

export async function getConfiguration(client: any) {
  const { data } = await client.query({
    query: CONFIGURATION_QUERY,
    variables: { include: [PLUGIN_ID] },
    // Needed so we don't trample the Apollo cache
    fetchPolicy: "no-cache",
  });
  const raw =
    data &&
    data.configuration &&
    data.configuration.plugins &&
    data.configuration.plugins[PLUGIN_ID];
  return normalizeConfig(raw);
}

// Very important that we send the full config here as it overwrites everything
export async function setConfiguration(client: any, config: any) {
  await client.mutate({
    mutation: CONFIGURE_PLUGIN_MUTATION,
    variables: { plugin_id: PLUGIN_ID, input: config },
  });
}

export async function fetchLibraryPaths(client: any): Promise<string[]> {
  const { data } = await client.query({
    query: CONFIGURATION_QUERY,
    variables: { include: [PLUGIN_ID] },
    fetchPolicy: "no-cache",
  });
  const stashes = data?.configuration?.general?.stashes || [];
  return stashes.filter((s: any) => !s.excludeVideo).map((s: any) => s.path);
}

export interface StashBoxSummary {
  name: string;
  endpoint: string;
}

export async function fetchStashBoxes(client: any): Promise<StashBoxSummary[]> {
  const { data } = await client.query({
    query: CONFIGURATION_QUERY,
    variables: { include: [PLUGIN_ID] },
    fetchPolicy: "no-cache",
  });
  return data?.configuration?.general?.stashBoxes || [];
}

export async function fetchPluginDisplayName(
  client: any,
): Promise<string | null> {
  const { data } = await client.query({ query: PLUGINS_QUERY });
  const plugins = (data && data.plugins) || [];
  const mine = plugins.find((p: any) => p.id === PLUGIN_ID);
  return mine ? mine.name : null;
}

type EntityType = "performer" | "tag" | "studio";
type EntityIdSets = Record<EntityType, Set<string>>;

const FIND_QUERY_FIELD: Record<EntityType, string> = {
  performer: "findPerformer",
  tag: "findTag",
  studio: "findStudio",
};

export async function findDeadEntityIds(
  client: any,
  ids: EntityIdSets,
): Promise<EntityIdSets> {
  const dead: EntityIdSets = {
    performer: new Set(),
    tag: new Set(),
    studio: new Set(),
  };

  const lookups: { alias: string; type: EntityType; id: string }[] = [];
  (Object.keys(ids) as EntityType[]).forEach((type) => {
    Array.from(ids[type]).forEach((id, i) => {
      lookups.push({ alias: type[0] + i, type, id });
    });
  });

  if (lookups.length === 0) {
    return dead;
  }

  const varDecls = lookups.map((l) => "$" + l.alias + ": ID!").join(", ");
  const fields = lookups
    .map(
      (l) =>
        l.alias +
        ": " +
        FIND_QUERY_FIELD[l.type] +
        "(id: $" +
        l.alias +
        ") { id }",
    )
    .join("\n    ");
  const query = gql(`
    query LibrarianCheckEntitiesExist(${varDecls}) {
    ${fields}
    }
  `);
  const variables: Record<string, string> = {};
  lookups.forEach((l) => {
    variables[l.alias] = l.id;
  });

  const { data } = await client.query({
    query,
    variables,
    fetchPolicy: "network-only",
  });

  lookups.forEach((l) => {
    if (!data || !data[l.alias]) {
      dead[l.type].add(l.id);
    }
  });

  return dead;
}

export async function runRenameTask(
  client: any,
  argsMap: Record<string, unknown>,
): Promise<string> {
  const { data } = await client.mutate({
    mutation: RUN_PLUGIN_TASK_MUTATION,
    variables: {
      plugin_id: PLUGIN_ID,
      task_name: "Rename (filtered)",
      args_map: { mode: "task", ...argsMap },
    },
  });
  return data && data.runPluginTask;
}
