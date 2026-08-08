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
          "this gallery is a folder of loose images rather than a zip. Stash has no way to move or rename a gallery folder, and moving the images individually would leave this gallery (with its title, date, rating and tags) behind on the old folder while a new empty gallery is created for the new one. Convert it to a zip if you want Librarian to rename it",
      };
    }
    return null;
  },
};

const IMAGES = {
  noun: "image",
  plural: "images",
  label: "Images",
  // ImageFile exposes format/width/height, so resolution resolves but the
  // video-only tokens do not
  tokens: METADATA_TOKENS.concat(["resolution"]),
  fileTechTokens: ["resolution"],
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
