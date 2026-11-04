import test from "node:test";
import assert from "node:assert/strict";
import { run } from "../../src/backend/task-entry.js";
import { run as runHook } from "../../src/backend/hook-entry.js";
import {
  RESULTS_PLUGIN_ID,
  findRun,
  openFailures,
} from "../../src/core/run-results.js";

const CONFIG = {
  scenes: {
    onlyOrganized: false,
    defaultPattern: {
      libraryRoot: "/data",
      folderPattern: "Sorted",
      filenamePattern: "{current}",
    },
  },
};

const SCENES = {
  1: { id: "1", title: "Alpha", files: [{ id: "11", path: "/in/a.mp4" }] },
  2: { id: "2", title: "", files: [{ id: "12", path: "/in/clip.mp4" }] },
};

// A stand-in for Stash: the move of file 12 is refused because scene 9 is
// already at its target, and plugin config is kept per id like Stash keeps it
function stashGlobals(storedResults) {
  const pluginConfig = { librarian: CONFIG };
  if (storedResults) {
    pluginConfig[RESULTS_PLUGIN_ID] = storedResults;
  }
  const writes = [];
  globalThis.gql = {
    Do: (query, variables) => {
      if (query.indexOf("GetPluginConfig") !== -1) {
        const plugins = {};
        variables.include.forEach((id) => {
          if (pluginConfig[id]) {
            plugins[id] = pluginConfig[id];
          }
        });
        return { configuration: { plugins } };
      }
      if (query.indexOf("ConfigurePlugin") !== -1) {
        writes.push(variables.plugin_id);
        pluginConfig[variables.plugin_id] = variables.input;
        return { configurePlugin: variables.input };
      }
      if (query.indexOf("GetLibraryPaths") !== -1) {
        return { configuration: { general: { stashes: [{ path: "/data" }] } } };
      }
      if (query.indexOf("FindScene(") !== -1) {
        return { findScene: SCENES[variables.id] || null };
      }
      if (query.indexOf("MoveFiles") !== -1) {
        if (variables.input.ids[0] === "12") {
          throw new Error("file /data/Sorted/clip.mp4 already exists");
        }
        return { moveFiles: true };
      }
      if (query.indexOf("OwnerOfPath") !== -1) {
        return { result: { items: [{ id: "9", title: "Clip" }] } };
      }
      throw new Error("unexpected query: " + query);
    },
  };
  globalThis.log = {
    Debug: () => {},
    Info: () => {},
    Warn: () => {},
    Error: () => {},
    Progress: () => {},
  };
  return { pluginConfig, writes };
}

test("a run started with a run_id leaves its counts and failures under the results id", () => {
  const stash = stashGlobals(null);
  run({ mode: "task", sceneIds: ["1", "2"], run_id: "r1" });
  const result = findRun(stash.pluginConfig[RESULTS_PLUGIN_ID], "r1");
  assert.equal(result.changed, 1);
  assert.equal(result.failureCount, 1);
  assert.deepEqual(result.failures[0].collision, {
    path: "/data/Sorted/clip.mp4",
    ownerId: "9",
    ownerTitle: "Clip",
  });
  assert.equal(result.failures[0].id, "2");
  // untitled, so named after its file the way its preview row is
  assert.equal(result.failures[0].title, "clip.mp4");
});

test("recording a run never touches Librarian's own settings", () => {
  const stash = stashGlobals(null);
  run({ mode: "task", sceneIds: ["1"], run_id: "r1" });
  assert.deepEqual(stash.writes, [RESULTS_PLUGIN_ID]);
  assert.deepEqual(stash.pluginConfig.librarian, CONFIG);
});

test("a run keeps the earlier runs it found", () => {
  const stash = stashGlobals({ runs: [{ runId: "r0", changed: 3 }] });
  run({ mode: "task", sceneIds: ["1"], run_id: "r1" });
  const stored = stash.pluginConfig[RESULTS_PLUGIN_ID];
  assert.equal(findRun(stored, "r0").changed, 3);
  assert.equal(findRun(stored, "r1").changed, 1);
});

test("a run from Stash's Tasks page has no run to report but still leaves what failed open", () => {
  const stash = stashGlobals(null);
  run({ mode: "task", sceneIds: ["1", "2"] });
  const stored = stash.pluginConfig[RESULTS_PLUGIN_ID];
  assert.deepEqual(stored.runs, []);
  assert.deepEqual(
    openFailures(stored, "scenes").map((f) => f.id),
    ["2"],
  );
});

test("a failure stays open until that item renames or is found in place", () => {
  const stash = stashGlobals(null);
  run({ mode: "task", sceneIds: ["2"] });
  assert.equal(
    openFailures(stash.pluginConfig[RESULTS_PLUGIN_ID], "scenes").length,
    1,
  );
  SCENES[2].files[0].path = "/data/Sorted/clip.mp4";
  try {
    run({ mode: "task", sceneIds: ["2"] });
  } finally {
    SCENES[2].files[0].path = "/in/clip.mp4";
  }
  assert.deepEqual(
    openFailures(stash.pluginConfig[RESULTS_PLUGIN_ID], "scenes"),
    [],
  );
});

test("an item that no longer exists drops out of what is open", () => {
  const stash = stashGlobals({
    open: { scenes: { 404: { id: "404", message: "x", at: "t" } } },
  });
  run({ mode: "task", sceneIds: ["404"] });
  assert.deepEqual(
    openFailures(stash.pluginConfig[RESULTS_PLUGIN_ID], "scenes"),
    [],
  );
});

test("a run that changes nothing open writes nothing", () => {
  const stash = stashGlobals(null);
  run({ mode: "task", sceneIds: ["1"] });
  assert.deepEqual(stash.writes, []);
});

test("automatic renaming leaves a failure open and closes it once the item renames", () => {
  const stash = stashGlobals(null);
  stash.pluginConfig.librarian = {
    scenes: Object.assign({}, CONFIG.scenes, { autoRename: true }),
  };
  runHook({ hookContext: { id: "2", type: "Scene.Update.Post" } });
  assert.deepEqual(
    openFailures(stash.pluginConfig[RESULTS_PLUGIN_ID], "scenes").map((f) => [
      f.id,
      f.collision.ownerId,
    ]),
    [["2", "9"]],
  );
  SCENES[2].files[0].path = "/data/Sorted/clip.mp4";
  try {
    runHook({ hookContext: { id: "2", type: "Scene.Update.Post" } });
  } finally {
    SCENES[2].files[0].path = "/in/clip.mp4";
  }
  assert.deepEqual(
    openFailures(stash.pluginConfig[RESULTS_PLUGIN_ID], "scenes"),
    [],
  );
});
