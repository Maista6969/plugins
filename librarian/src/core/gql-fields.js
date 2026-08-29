export const STUDIO_FIELDS = `
  id
  name
  custom_fields
  favorite
  rating100
  parent_studio {
    id
    name
    custom_fields
    favorite
    rating100
    parent_studio {
      id
      name
      custom_fields
      favorite
      rating100
      parent_studio {
        id
        name
        custom_fields
        favorite
        rating100
        parent_studio {
          id
          name
          custom_fields
          favorite
          rating100
        }
      }
    }
  }
`;

// Stash allows two performers to share a name only when their disambiguations
// differ, so the name alone does not identify a performer and cannot safely
// name a folder on its own
export const PERFORMER_FIELDS = `id name disambiguation favorite rating100 gender custom_fields`;

export const TAG_FIELDS = `id name sort_name`;

// Only scenes have groups: SceneGroup pairs the group with the scene's index
// inside it, and that index is nullable, so a scene can be in a group without
// having a place in its running order
export const GROUP_FIELDS = `id name`;

export const SCENE_GROUP_FIELDS = `
  scene_index
  group { ${GROUP_FIELDS} }
`;
