import { PLUGIN_ID } from "../core/config-schema.js";

export const STUDIO_FIELDS = `
  id
  name
  parent_studio {
    id
    name
    parent_studio {
      id
      name
      parent_studio {
        id
        name
        parent_studio {
          id
          name
        }
      }
    }
  }
`;

export const SCENE_FIELDS = `
  id
  title
  code
  date
  organized
  rating100
  stash_ids { endpoint stash_id }
  studio {
    ${STUDIO_FIELDS}
  }
  performers { id name favorite rating100 }
  tags { id name sort_name }
  files {
    id
    path
    width
    height
    video_codec
    audio_codec
    bit_rate
    frame_rate
    fingerprints { type value }
  }
`;

const FIND_SCENES_QUERY = `
  query FindScenes($scene_filter: SceneFilterType, $filter: FindFilterType) {
    findScenes(scene_filter: $scene_filter, filter: $filter) {
      count
      scenes { ${SCENE_FIELDS} }
    }
  }
`;

const FIND_SCENE_QUERY = `
  query FindScene($id: ID!) {
    findScene(id: $id) { ${SCENE_FIELDS} }
  }
`;

const MOVE_FILES_MUTATION = `
  mutation MoveFiles($input: MoveFilesInput!) {
    moveFiles(input: $input)
  }
`;

const CONFIGURATION_QUERY = `
  query GetPluginConfig($include: [ID!]) {
    configuration {
      plugins(include: $include)
    }
  }
`;

const LIBRARY_PATHS_QUERY = `
  query GetLibraryPaths {
    configuration {
      general {
        stashes {
          path
          excludeVideo
        }
      }
    }
  }
`;

const CONFIGURE_PLUGIN_MUTATION = `
  mutation ConfigurePlugin($plugin_id: ID!, $input: Map!) {
    configurePlugin(plugin_id: $plugin_id, input: $input)
  }
`;

const SCENE_COUNT_QUERY = `
  query CountScenes($scene_filter: SceneFilterType) {
    findScenes(scene_filter: $scene_filter) {
      count
    }
  }
`;

const FIND_QUERY_FIELD = {
  performer: "findPerformer",
  tag: "findTag",
  studio: "findStudio",
};

function doQuery(query, variables) {
  return gql.Do(query, variables);
}

export function gqlFindScenes(sceneFilter, findFilter) {
  const variables = {};
  if (sceneFilter) {
    variables.scene_filter = sceneFilter;
  }
  if (findFilter) {
    variables.filter = findFilter;
  }
  return doQuery(FIND_SCENES_QUERY, variables).findScenes;
}

export function gqlFindScene(id) {
  return doQuery(FIND_SCENE_QUERY, { id: id }).findScene;
}

export function gqlMoveFile(fileId, destinationFolder, destinationBasename) {
  const input = { ids: [fileId], destination_folder: destinationFolder };
  if (destinationBasename) {
    input.destination_basename = destinationBasename;
  }
  return doQuery(MOVE_FILES_MUTATION, { input: input }).moveFiles === true;
}

export function gqlGetConfig() {
  const result = doQuery(CONFIGURATION_QUERY, { include: [PLUGIN_ID] });
  const plugins = result.configuration && result.configuration.plugins;
  return plugins ? plugins[PLUGIN_ID] : null;
}

export function gqlGetLibraryPaths() {
  const result = doQuery(LIBRARY_PATHS_QUERY, {});
  const stashes =
    (result.configuration &&
      result.configuration.general &&
      result.configuration.general.stashes) ||
    [];
  return stashes.filter((s) => !s.excludeVideo).map((s) => s.path);
}

export function gqlConfigurePlugin(config) {
  doQuery(CONFIGURE_PLUGIN_MUTATION, { plugin_id: PLUGIN_ID, input: config });
}

export function gqlCountScenes(sceneFilter) {
  return (
    doQuery(SCENE_COUNT_QUERY, { scene_filter: sceneFilter }).findScenes
      .count || 0
  );
}

export function gqlFindDeadEntityIds(ids) {
  const dead = { performer: new Set(), tag: new Set(), studio: new Set() };

  const lookups = [];
  ["performer", "tag", "studio"].forEach((type) => {
    let i = 0;
    ids[type].forEach((id) => {
      lookups.push({ alias: type[0] + i, type: type, id: id });
      i++;
    });
  });

  if (lookups.length === 0) {
    return dead;
  }

  const varDecls = lookups.map((l) => "$" + l.alias + ": ID!").join(", ");
  const fields = lookups
    .map(
      (l) => `${l.alias}: ${FIND_QUERY_FIELD[l.type]} (id: $${l.alias}) { id }`,
    )
    .join("\n");
  const query =
    "query CheckEntitiesExist(" + varDecls + ") {\n" + fields + "\n}";

  const variables = {};
  lookups.forEach((l) => {
    variables[l.alias] = l.id;
  });

  const result = doQuery(query, variables);

  lookups.forEach((l) => {
    if (!result || !result[l.alias]) {
      dead[l.type].add(l.id);
    }
  });

  return dead;
}
