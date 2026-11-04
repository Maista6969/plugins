import { PLUGIN_ID } from "./config-schema.js";
import { normalizePathForCompare } from "./path-template.js";

// A plugin task's own output only reaches Stash's log, so what renames came to
// is left under a plugin-config key of its own for the UI to read back. Never
// Librarian's own key: configurePlugin replaces a key whole, and a long run
// would overwrite settings saved while it was going.
//
// It holds the last few runs started from the UI, looked up by the run id the
// UI passed, and per entity type the failures still open: whatever has not
// been renamed or found in place since it failed
export const RESULTS_PLUGIN_ID = PLUGIN_ID + "-results";

const ENTITY_TYPES = ["scenes", "galleries", "images"];
const MAX_RUNS = 10;
export const MAX_FAILURES = 50;
export const MAX_OPEN_FAILURES = 200;

function failureFromError(e) {
  const failure = {
    id: e.sceneId == null ? null : String(e.sceneId),
    title: e.title || "",
    message: e.error,
  };
  if (e.collision) {
    failure.collision = e.collision;
  }
  if (e.missingData) {
    failure.missingData = e.missingData;
  }
  return failure;
}

export function runFromSummary(runId, entityType, summary) {
  const errors = summary.errors || [];
  return {
    runId: String(runId),
    entity: entityType,
    processed: summary.processed || 0,
    changed: summary.changed || 0,
    unchanged: summary.unchanged || 0,
    skipped: summary.skipped || 0,
    failureCount: errors.length,
    failures: errors.slice(0, MAX_FAILURES).map(failureFromError),
  };
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// copies as it reads, so callers can change the result freely
function normalizeStore(stored) {
  const runs =
    isPlainObject(stored) && Array.isArray(stored.runs) ? stored.runs : [];
  const open = {};
  ENTITY_TYPES.forEach((type) => {
    const mine =
      isPlainObject(stored) && isPlainObject(stored.open)
        ? stored.open[type]
        : null;
    open[type] = isPlainObject(mine) ? Object.assign({}, mine) : {};
  });
  return { runs: runs.slice(), open };
}

export function recordRun(stored, run) {
  const store = normalizeStore(stored);
  const others = store.runs.filter((r) => {
    return r && r.runId !== run.runId;
  });
  store.runs = [run].concat(others).slice(0, MAX_RUNS);
  return store;
}

export function findRun(stored, runId) {
  return (
    normalizeStore(stored).runs.find((r) => {
      return r && r.runId === String(runId);
    }) || null
  );
}

// errors are the task's own summary entries; resolvedIds are the entities
// that renamed, were already in place or no longer qualify. Returns whether
// anything changed so an all-clear run need not write
export function applyOutcomes(stored, entityType, errors, resolvedIds, at) {
  const store = normalizeStore(stored);
  const open = store.open[entityType];
  if (!open) {
    return { store, changed: false };
  }
  let changed = false;
  (resolvedIds || []).forEach((id) => {
    if (Object.prototype.hasOwnProperty.call(open, String(id))) {
      delete open[String(id)];
      changed = true;
    }
  });
  (errors || []).forEach((e) => {
    if (e.sceneId == null) {
      return;
    }
    const id = String(e.sceneId);
    // an entity that no longer exists has nothing left to rename
    if (e.gone) {
      if (Object.prototype.hasOwnProperty.call(open, id)) {
        delete open[id];
        changed = true;
      }
      return;
    }
    open[id] = Object.assign(failureFromError(e), { at });
    changed = true;
  });
  const ids = Object.keys(open);
  if (ids.length > MAX_OPEN_FAILURES) {
    ids
      .sort((a, b) => {
        return String(open[b].at).localeCompare(String(open[a].at));
      })
      .slice(MAX_OPEN_FAILURES)
      .forEach((id) => {
        delete open[id];
      });
  }
  return { store, changed };
}

// newest first
export function openFailures(stored, entityType) {
  const open = normalizeStore(stored).open[entityType] || {};
  return Object.keys(open)
    .map((id) => {
      return open[id];
    })
    .sort((a, b) => {
      return String(b.at).localeCompare(String(a.at));
    });
}

export function clearOpenFailures(stored, entityType) {
  const store = normalizeStore(stored);
  store.open[entityType] = {};
  return store;
}

// A failure is only worth repeating next to a plan that still heads for the
// path that was taken: once the rules send the file elsewhere it is history
export function failureStillApplies(failure, plannedTargets) {
  if (!failure.collision) {
    return true;
  }
  const taken = normalizePathForCompare(failure.collision.path);
  return (plannedTargets || []).some((target) => {
    return normalizePathForCompare(target) === taken;
  });
}
