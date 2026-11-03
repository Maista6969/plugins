import test from "node:test";
import assert from "node:assert/strict";
import { renameEntity } from "../../src/backend/core-runner.js";
import { normalizeConfig } from "../../src/core/config-schema.js";

// Stash hands a JS plugin these as globals: gql.Do runs GraphQL synchronously,
// log writes to Stash's log
function stashGlobals(moveResult) {
  const logged = [];
  globalThis.gql = {
    Do: () => {
      return { moveFiles: moveResult };
    },
  };
  globalThis.log = {
    Debug: (line) => logged.push(["Debug", line]),
    Info: (line) => logged.push(["Info", line]),
    Error: (line) => logged.push(["Error", line]),
  };
  return logged;
}

const SCENE = {
  id: "157",
  title: "Alpha One",
  organized: true,
  files: [{ id: "1", path: "/data/incoming/a1.mp4" }],
};

function configAt(logLevel) {
  return normalizeConfig({
    logLevel: logLevel,
    scenes: {
      defaultPattern: {
        libraryRoot: "/data",
        folderPattern: "Sorted",
        filenamePattern: "{title}",
      },
    },
  });
}

test("each moved file is logged with its old and new path at the chosen level", () => {
  const logged = stashGlobals(true);
  renameEntity(SCENE, configAt("info"), "scenes", null);
  assert.deepEqual(logged, [
    ["Info", "scene 157: /data/incoming/a1.mp4 -> /data/Sorted/Alpha One.mp4"],
  ]);
});

test("Debug is the default level", () => {
  const logged = stashGlobals(true);
  renameEntity(SCENE, configAt(undefined), "scenes", null);
  assert.equal(logged.length, 1);
  assert.equal(logged[0][0], "Debug");
});

test("None logs nothing", () => {
  const logged = stashGlobals(true);
  renameEntity(SCENE, configAt("off"), "scenes", null);
  assert.deepEqual(logged, []);
});

test("a move Stash refused is not logged as a rename", () => {
  const logged = stashGlobals(false);
  const outcome = renameEntity(SCENE, configAt("info"), "scenes", null);
  assert.deepEqual(logged, []);
  assert.equal(outcome.moveErrors.length, 1);
});

test("a file already at its target is not logged", () => {
  const logged = stashGlobals(true);
  renameEntity(
    {
      ...SCENE,
      files: [{ id: "1", path: "/data/Sorted/Alpha One.mp4" }],
    },
    configAt("info"),
    "scenes",
    null,
  );
  assert.deepEqual(logged, []);
});
