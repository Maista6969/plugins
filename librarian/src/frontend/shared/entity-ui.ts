// Presentation-only per-entity-type details. These stay out of core/entity-adapter.js,
// which is shared with the Goja backend and must not know about routes or thumbnails.
export interface EntityUI {
  route: string;
  thumbnail: (entity: any) => string | undefined;
  files: (entity: any) => any[];
  fileNoun: string;
}

export const ENTITY_UI: Record<string, EntityUI> = {
  scenes: {
    route: "/scenes/",
    thumbnail: (e) => e.paths && e.paths.screenshot,
    files: (e) => e.files || [],
    fileNoun: "video files",
  },
  galleries: {
    route: "/galleries/",
    thumbnail: (e) => e.paths && e.paths.cover,
    files: (e) => e.files || [],
    fileNoun: "zip file",
  },
  images: {
    route: "/images/",
    thumbnail: (e) => e.paths && e.paths.thumbnail,
    files: (e) => e.visual_files || [],
    fileNoun: "image files",
  },
};

export function entityUI(entityType?: string): EntityUI {
  return ENTITY_UI[entityType || "scenes"] || ENTITY_UI.scenes;
}
