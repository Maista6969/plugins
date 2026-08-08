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
  performers { id name favorite rating100 }
  tags { id name sort_name }
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
