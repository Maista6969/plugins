import test from "node:test";
import assert from "node:assert/strict";
import { findPathClashes, clashKey } from "../../src/core/path-clashes.js";
import {
  runFromSummary,
  recordRun,
  findRun,
  applyOutcomes,
  openFailures,
  clearOpenFailures,
  failureStillApplies,
  MAX_FAILURES,
  MAX_OPEN_FAILURES,
} from "../../src/core/run-results.js";

function moving(id, fileId, folder, basename) {
  return {
    scene: { id, title: "Scene " + id },
    plan: {
      status: "ok",
      files: [
        {
          fileId,
          folder,
          basename,
          currentPath: "/in/" + fileId + ".mp4",
          unchanged: false,
        },
      ],
    },
  };
}

function staying(id, fileId, path) {
  return {
    scene: { id, title: "Scene " + id },
    plan: {
      status: "ok",
      files: [{ fileId, currentPath: path, unchanged: true }],
    },
  };
}

test("two files moving to the same path each name the other", () => {
  const clashes = findPathClashes([
    moving("1", "11", "/data", "Same.mp4"),
    moving("2", "12", "/data/", "Same.mp4"),
    moving("3", "13", "/data", "Other.mp4"),
  ]);
  assert.deepEqual(
    clashes.get(clashKey("1", "11")).map((c) => [c.scene.id, c.alreadyThere]),
    [["2", false]],
  );
  assert.deepEqual(
    clashes.get(clashKey("2", "12")).map((c) => [c.scene.id, c.alreadyThere]),
    [["1", false]],
  );
  assert.equal(clashes.has(clashKey("3", "13")), false);
});

test("moving onto a file that stays put warns the mover only", () => {
  const clashes = findPathClashes([
    staying("1", "11", "/data/Same.mp4"),
    moving("2", "12", "/data", "Same.mp4"),
  ]);
  assert.deepEqual(
    clashes.get(clashKey("2", "12")).map((c) => [c.scene.id, c.alreadyThere]),
    [["1", true]],
  );
  assert.equal(clashes.has(clashKey("1", "11")), false);
});

test("skipped and errored rows plan no path, so clash with nothing", () => {
  const clashes = findPathClashes([
    { scene: { id: "1" }, plan: { status: "skipped" } },
    { scene: { id: "2" }, plan: { status: "error" } },
    moving("3", "13", "/data", "Same.mp4"),
  ]);
  assert.equal(clashes.size, 0);
});

test("a run keeps every failure in its count but only the first few in detail", () => {
  const errors = [];
  for (let i = 0; i < MAX_FAILURES + 5; i++) {
    errors.push({ sceneId: i, error: "nope" });
  }
  const run = runFromSummary("r", "scenes", { changed: 2, errors });
  assert.equal(run.failureCount, MAX_FAILURES + 5);
  assert.equal(run.failures.length, MAX_FAILURES);
  assert.equal(run.failures[0].id, "0");
});

test("the newest run comes first and the oldest fall off", () => {
  let stored = null;
  for (let i = 0; i < 12; i++) {
    stored = recordRun(stored, { runId: "r" + i });
  }
  assert.equal(stored.runs[0].runId, "r11");
  assert.equal(stored.runs.length, 10);
  assert.equal(findRun(stored, "r1"), null);
  assert.equal(findRun(stored, "r2").runId, "r2");
});

test("whatever else is stored under the key is read as nothing", () => {
  assert.equal(findRun("junk", "r"), null);
  assert.deepEqual(recordRun({ runs: "junk" }, { runId: "r" }).runs, [
    { runId: "r" },
  ]);
  assert.deepEqual(openFailures({ open: { scenes: "junk" } }, "scenes"), []);
});

test("recording a run keeps what is open, and the reverse", () => {
  const withOpen = applyOutcomes(
    null,
    "scenes",
    [{ sceneId: 1, error: "x" }],
    [],
    "t1",
  ).store;
  const withRun = recordRun(withOpen, { runId: "r" });
  assert.equal(openFailures(withRun, "scenes").length, 1);
  const again = applyOutcomes(withRun, "scenes", [], [], "t2").store;
  assert.equal(findRun(again, "r").runId, "r");
});

test("open failures are kept per type and newest first, up to a cap", () => {
  let stored = null;
  for (let i = 0; i < MAX_OPEN_FAILURES + 3; i++) {
    const at = "2026-11-04T10:00:" + String(i).padStart(3, "0");
    stored = applyOutcomes(
      stored,
      "scenes",
      [{ sceneId: i, error: "x" }],
      [],
      at,
    ).store;
  }
  const open = openFailures(stored, "scenes");
  assert.equal(open.length, MAX_OPEN_FAILURES);
  assert.equal(open[0].id, String(MAX_OPEN_FAILURES + 2));
  assert.equal(
    open.some((f) => f.id === "0"),
    false,
  );
  assert.deepEqual(openFailures(stored, "images"), []);
  assert.deepEqual(
    openFailures(clearOpenFailures(stored, "scenes"), "scenes"),
    [],
  );
});

test("a run that resolves nothing open reports no change", () => {
  const stored = applyOutcomes(
    null,
    "scenes",
    [{ sceneId: 1, error: "x" }],
    [],
    "t",
  ).store;
  assert.equal(applyOutcomes(stored, "scenes", [], ["2"], "t").changed, false);
  assert.equal(applyOutcomes(stored, "scenes", [], ["1"], "t").changed, true);
});

test("a clash is only repeated next to a plan still heading for the taken path", () => {
  const failure = { collision: { path: "/data/Same.mp4" } };
  assert.equal(failureStillApplies(failure, ["/data/Same.mp4"]), true);
  assert.equal(failureStillApplies(failure, ["/data/Other.mp4"]), false);
  assert.equal(
    failureStillApplies({ message: "x" }, ["/data/Other.mp4"]),
    true,
  );
});
