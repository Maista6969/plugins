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

export const PERFORMER_FIELDS = `id name favorite rating100 gender`;

export const TAG_FIELDS = `id name sort_name`;
