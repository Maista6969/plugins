// Per-entity-type differences in where the movable files live and which
// entities cannot be renamed at all. Verified against Stash's GraphQL API:
// see the notes on each adapter for why the guards exist.

import {
  KNOWN_TOKENS,
  METADATA_TOKENS,
  FILE_TECH_TOKENS,
} from "./path-template.js";

const SCENES = {
  noun: "scene",
  plural: "scenes",
  label: "Scenes",
  // scenes are the only type with stash_ids, and the only one whose files
  // report codecs, bitrate and framerate
  tokens: KNOWN_TOKENS,
  fileTechTokens: FILE_TECH_TOKENS,
  files: (raw) => {
    return raw.files || [];
  },
  ineligible: () => {
    return null;
  },
};

const GALLERIES = {
  noun: "gallery",
  plural: "galleries",
  label: "Galleries",
  // a GalleryFile carries no width/height/codec fields at all, so no file-tech
  // token can resolve for a zip gallery
  tokens: METADATA_TOKENS,
  fileTechTokens: [],
  files: (raw) => {
    return raw.files || [];
  },
  // A zip gallery exposes a movable GalleryFile; a folder gallery only exposes a
  // Folder. moveFiles takes file ids only, there is no moveFolder mutation, and
  // GalleryUpdateInput has no folder_id, so a folder gallery's identity cannot be
  // repointed. Moving its images instead strands the gallery and all its metadata
  // on the old folder and creates a fresh blank gallery at the destination.
  // Passing the folder's own id to moveFiles is worse still: folder ids and file
  // ids are separate sequences, so it silently moves an unrelated file.
  ineligible: (raw) => {
    if ((raw.files || []).length > 0) {
      return null;
    }
    if (raw.folder) {
      return {
        reason: "folder_gallery",
        message:
          "this gallery is a folder of loose images, convert it to a zip if you want Librarian to rename it",
      };
    }
    return null;
  },
};

const IMAGES = {
  noun: "image",
  plural: "images",
  label: "Images",
  // No file-tech tokens. Stash has no imageMerge, and scanning only associates
  // files by exact-content hash, so the several files an image can hold are
  // always byte-identical duplicates: resolution could never tell them apart.
  // Scenes are the only type where files of differing quality coexist, via sceneMerge.
  tokens: METADATA_TOKENS,
  fileTechTokens: [],
  // files is deprecated and silently drops video-backed images, so an animated
  // image would look like it simply had no files
  files: (raw) => {
    return raw.visual_files || [];
  },
  // Stash refuses to move anything inside a zip before doing anything else, so
  // even a pure rename of a zip gallery's image fails
  ineligible: (raw) => {
    const files = raw.visual_files || [];
    const inZip = files.filter((f) => {
      return f && f.zip_file_id;
    });
    if (inZip.length === 0) {
      return null;
    }
    return {
      reason: "in_zip_gallery",
      message:
        "this image lives inside a zip gallery, and Stash cannot move or rename files contained in a zip. Rename the gallery itself instead",
    };
  },
};

export const ENTITY_ADAPTERS = {
  scenes: SCENES,
  galleries: GALLERIES,
  images: IMAGES,
};

export function adapterFor(entityType) {
  return ENTITY_ADAPTERS[entityType] || SCENES;
}

export function tokensFor(entityType) {
  return adapterFor(entityType).tokens;
}
