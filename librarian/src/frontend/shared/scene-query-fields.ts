import {
  STUDIO_FIELDS,
  PERFORMER_FIELDS,
  SCENE_GROUP_FIELDS,
  TAG_FIELDS,
} from "../../core/gql-fields.js";

// re-exported because several preview components query studios on their own
export { STUDIO_FIELDS };

// We fetch all paths even if we don't use them just
// so we don't trample the Apollo cache
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
  performers { ${PERFORMER_FIELDS} }
  groups { ${SCENE_GROUP_FIELDS} }
  tags { ${TAG_FIELDS} }
  paths {
    screenshot
    preview
    stream
    webp
    vtt
    sprite
    funscript
    interactive_heatmap
    caption
  }
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
  performers { ${PERFORMER_FIELDS} }
  groups { ${SCENE_GROUP_FIELDS} }
  tags { ${TAG_FIELDS} }
`;

// folder is fetched so folder-based galleries can be told apart from zip ones
export const GALLERY_FIELDS = `
  ${COMMON_METADATA_FIELDS}
  paths { cover }
  files {
    id
    path
    parent_folder { id }
    fingerprints { type value }
  }
  folder { id path }
`;

// visual_files rather than the deprecated files, which silently drops
// video-backed (animated) images.
// galleries is fetched so an image in a folder-based gallery can be told apart
// from one in a zip: a folder gallery has no files of its own
export const IMAGE_FIELDS = `
  ${COMMON_METADATA_FIELDS}
  galleries { id folder { id } files { id } }
  paths { thumbnail }
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

export const ENTITY_FIELDS: Record<string, string> = {
  scenes: SCENE_FIELDS,
  galleries: GALLERY_FIELDS,
  images: IMAGE_FIELDS,
};
