import test from "node:test";
import assert from "node:assert/strict";
import { adapterFor } from "../../src/core/entity-adapter.js";
import { planEntity } from "../../src/core/plan-scene.js";
import { normalizeConfig } from "../../src/core/config-schema.js";

function config(overrides) {
  return normalizeConfig(
    Object.assign(
      {
        galleries: {
          onlyOrganized: false,
          defaultPattern: { folderPattern: "", filenamePattern: "{title}" },
        },
        images: {
          onlyOrganized: false,
          defaultPattern: { folderPattern: "", filenamePattern: "{title}" },
        },
      },
      overrides,
    ),
  );
}

const zipGallery = {
  id: "3",
  title: "Zip Gallery",
  organized: true,
  files: [
    {
      id: "16",
      path: "/data/g/my_zip_gallery.zip",
      parent_folder: { id: "f1" },
    },
  ],
  folder: null,
};

const folderGallery = {
  id: "1",
  title: "Folder Gallery",
  organized: true,
  files: [],
  folder: { id: "9", path: "/data/g/FolderGallery" },
};

const looseImage = {
  id: "1",
  title: "Loose Image",
  organized: true,
  visual_files: [
    {
      id: "11",
      path: "/data/g/img.jpg",
      zip_file_id: null,
      parent_folder: { id: "f1" },
    },
  ],
};

const zippedImage = {
  id: "6",
  title: "Zipped Image",
  organized: true,
  visual_files: [
    {
      id: "17",
      path: "/data/g/my_zip_gallery.zip/zimg_1.jpg",
      zip_file_id: "16",
      parent_folder: { id: "f2" },
    },
  ],
};

test("a zip gallery exposes its GalleryFile as movable", () => {
  const result = planEntity(zipGallery, config(), "galleries");
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].fileId, "16");
  assert.equal(result.files[0].basename, "Zip Gallery.zip");
});

test("a folder gallery is skipped, since Stash cannot move or rename a gallery folder", () => {
  const result = planEntity(folderGallery, config(), "galleries");
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "folder_gallery");
  assert.match(result.message, /zip/);
  assert.deepEqual(result.files, []);
});

test("a folder gallery reports the real blocker rather than a misleading no_files", () => {
  const result = planEntity(folderGallery, config(), "galleries");
  assert.notEqual(result.reason, "no_files");
});

test("the folder gallery guard never lets a folder id reach the move plan", () => {
  // folder and file ids are separate sequences, so a folder id passed to
  // moveFiles would silently move an unrelated file
  const result = planEntity(folderGallery, config(), "galleries");
  assert.deepEqual(result.files, []);
});

test("a loose image is renamed normally", () => {
  const result = planEntity(looseImage, config(), "images");
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].fileId, "11");
  assert.equal(result.files[0].basename, "Loose Image.jpg");
});

test("an image inside a zip gallery is skipped, since Stash refuses to touch zip contents", () => {
  const result = planEntity(zippedImage, config(), "images");
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "in_zip_gallery");
  assert.deepEqual(result.files, []);
});

test("images read visual_files, so a video-backed animated image is not silently dropped", () => {
  const animated = {
    id: "9",
    title: "Animated",
    organized: true,
    visual_files: [
      {
        id: "30",
        path: "/data/g/clip.webm",
        zip_file_id: null,
        parent_folder: { id: "f1" },
      },
    ],
  };
  assert.equal(adapterFor("images").files(animated).length, 1);
  const result = planEntity(animated, config(), "images");
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].basename, "Animated.webm");
});

test("galleries and images keep files in place by default, needing no library root", () => {
  const result = planEntity(zipGallery, config(), "galleries");
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].folder, "/data/g");
  assert.equal(result.files[0].folderId, "f1");
});

test("an unknown entity type falls back to the scene adapter rather than throwing", () => {
  assert.deepEqual(adapterFor("nonsense").files({ files: [{ id: "1" }] }), [
    { id: "1" },
  ]);
});
