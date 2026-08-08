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
    parent_folder { id }
    width
    height
    video_codec
    audio_codec
    bit_rate
    frame_rate
    fingerprints { type value }
  }
`;

const COMMON_METADATA_FIELDS = `
  id
  title
  code
  date
  organized
  rating100
  studio {
    ${STUDIO_FIELDS}
  }
  performers { id name favorite rating100 }
  tags { id name sort_name }
`;

// folder is fetched so folder-based galleries can be told apart from zip ones
// and skipped explicitly rather than looking like they simply have no files
export const GALLERY_FIELDS = `
  ${COMMON_METADATA_FIELDS}
  files {
    id
    path
    parent_folder { id }
    fingerprints { type value }
  }
  folder { id path }
`;

// visual_files rather than the deprecated files, which silently drops
// video-backed (animated) images. zip_file_id marks images Stash refuses to move
export const IMAGE_FIELDS = `
  ${COMMON_METADATA_FIELDS}
  visual_files {
    __typename
    ... on ImageFile {
      id
      path
      parent_folder { id }
      zip_file_id
      width
      height
      fingerprints { type value }
    }
    ... on VideoFile {
      id
      path
      parent_folder { id }
      zip_file_id
      width
      height
      video_codec
      audio_codec
      bit_rate
      frame_rate
      fingerprints { type value }
    }
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

const FIND_GALLERIES_QUERY = `
  query FindGalleries($entity_filter: GalleryFilterType, $filter: FindFilterType) {
    findGalleries(gallery_filter: $entity_filter, filter: $filter) {
      count
      items: galleries { ${GALLERY_FIELDS} }
    }
  }
`;

const FIND_GALLERY_QUERY = `
  query FindGallery($id: ID!) {
    findGallery(id: $id) { ${GALLERY_FIELDS} }
  }
`;

const FIND_IMAGES_QUERY = `
  query FindImages($entity_filter: ImageFilterType, $filter: FindFilterType) {
    findImages(image_filter: $entity_filter, filter: $filter) {
      count
      items: images { ${IMAGE_FIELDS} }
    }
  }
`;

const FIND_IMAGE_QUERY = `
  query FindImage($id: ID!) {
    findImage(id: $id) { ${IMAGE_FIELDS} }
  }
`;

const GALLERY_COUNT_QUERY = `
  query CountGalleries($entity_filter: GalleryFilterType) {
    findGalleries(gallery_filter: $entity_filter) { count }
  }
`;

const IMAGE_COUNT_QUERY = `
  query CountImages($entity_filter: ImageFilterType) {
    findImages(image_filter: $entity_filter) { count }
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
          excludeImage
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

const ENTITY_QUERIES = {
  scenes: {
    findMany: FIND_SCENES_QUERY,
    findOne: FIND_SCENE_QUERY,
    count: SCENE_COUNT_QUERY,
    // scenes predate the generic aliases and keep their original field names
    filterVar: "scene_filter",
    listField: "findScenes",
    itemsField: "scenes",
    oneField: "findScene",
  },
  galleries: {
    findMany: FIND_GALLERIES_QUERY,
    findOne: FIND_GALLERY_QUERY,
    count: GALLERY_COUNT_QUERY,
    filterVar: "entity_filter",
    listField: "findGalleries",
    itemsField: "items",
    oneField: "findGallery",
  },
  images: {
    findMany: FIND_IMAGES_QUERY,
    findOne: FIND_IMAGE_QUERY,
    count: IMAGE_COUNT_QUERY,
    filterVar: "entity_filter",
    listField: "findImages",
    itemsField: "items",
    oneField: "findImage",
  },
};

export function gqlFindEntities(entityType, entityFilter, findFilter) {
  const q = ENTITY_QUERIES[entityType];
  const variables = {};
  if (entityFilter) {
    variables[q.filterVar] = entityFilter;
  }
  if (findFilter) {
    variables.filter = findFilter;
  }
  const result = doQuery(q.findMany, variables)[q.listField];
  return { count: result.count, items: result[q.itemsField] };
}

export function gqlFindEntity(entityType, id) {
  const q = ENTITY_QUERIES[entityType];
  return doQuery(q.findOne, { id: id })[q.oneField];
}

export function gqlCountEntities(entityType, entityFilter) {
  const q = ENTITY_QUERIES[entityType];
  const variables = {};
  variables[q.filterVar] = entityFilter;
  return doQuery(q.count, variables)[q.listField].count || 0;
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

export function gqlMoveFile(
  fileId,
  destinationFolder,
  destinationBasename,
  destinationFolderId,
) {
  const input = { ids: [fileId] };
  if (destinationFolderId) {
    input.destination_folder_id = destinationFolderId;
  } else {
    input.destination_folder = destinationFolder;
  }
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
  const pathsFor = (excluded) => {
    return stashes.filter((s) => !s[excluded]).map((s) => s.path);
  };
  return {
    scenes: pathsFor("excludeVideo"),
    galleries: pathsFor("excludeImage"),
    images: pathsFor("excludeImage"),
  };
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
