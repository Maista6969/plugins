import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from "react";
import { useApolloClient, gql } from "@apollo/client";
import { planScene } from "../../core/plan-scene.js";
import { openFailures } from "../../core/run-results.js";
import {
  getConfiguration,
  fetchResultsStore,
  RunResult,
  RunFailure,
} from "../shared/stash-api.js";
import { JobInfo } from "../shared/job-poll.js";
import { useRenameJob, runRenameAndWait } from "../shared/rename-run.js";
import { failuresById } from "../shared/OpenFailuresContext.js";
import { SCENE_FIELDS } from "../shared/scene-query-fields.js";

const FIND_SCENE_QUERY = gql(`
  query LibrarianPreviewFindScene($id: ID!) {
    findScene(id: $id) { ${SCENE_FIELDS} }
  }
`);

interface PreviewModeContextValue {
  active: boolean;
  config: any | null;
  pendingSceneIds: Set<string>;
  sceneOverrides: Record<string, any>;
  jobId: string | null;
  job: JobInfo | null;
  result: RunResult | null;
  sceneFailures: Record<string, RunFailure>;
  startPreview: () => void;
  cancelPreview: () => void;
  applyRenames: () => void;
  applyOne: (sceneId: string) => void;
  liveFilter: any;
  setSceneOverride: (sceneId: string, scene: any) => void;
  reportDisplayMode: (displayMode: unknown) => void;
}

const defaultValue: PreviewModeContextValue = {
  active: false,
  config: null,
  pendingSceneIds: new Set(),
  sceneOverrides: {},
  jobId: null,
  job: null,
  result: null,
  sceneFailures: {},
  startPreview: () => {},
  cancelPreview: () => {},
  applyRenames: () => {},
  applyOne: () => {},
  setSceneOverride: () => {},
  reportDisplayMode: () => {},
  liveFilter: null,
};

export const PreviewModeContext =
  createContext<PreviewModeContextValue>(defaultValue);

export function usePreviewMode() {
  return useContext(PreviewModeContext);
}

export function PreviewModeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const client = useApolloClient();
  const [active, setActive] = useState(false);
  const [config, setConfig] = useState<any | null>(null);
  const [sceneFailures, setSceneFailures] = useState<
    Record<string, RunFailure>
  >({});
  // what the backend still has open, so failures from earlier visits show too
  const reloadFailures = useCallback(async () => {
    try {
      const store = await fetchResultsStore(client);
      setSceneFailures(failuresById(openFailures(store, "scenes")));
    } catch (e) {
      // leave whatever was shown
    }
  }, [client]);
  const {
    jobId,
    job,
    result,
    start: startJob,
    reset: resetJob,
  } = useRenameJob(() => {
    reloadFailures();
    client.refetchQueries({ include: ["FindScenes"] });
  });
  const [pendingSceneIds, setPendingSceneIds] = useState<Set<string>>(
    new Set(),
  );
  const [sceneOverrides, setSceneOverrides] = useState<Record<string, any>>({});
  const [liveFilter, setLiveFilter] = useState<any>(null);
  const enteredDisplayModeRef = useRef<unknown>(null);

  const startPreview = useCallback(async () => {
    setActive(true);
    resetJob();
    setSceneFailures({});
    setSceneOverrides({});
    enteredDisplayModeRef.current = liveFilter ? liveFilter.displayMode : null;
    reloadFailures();
    const freshConfig = await getConfiguration(client);
    setConfig(freshConfig);
  }, [client, liveFilter, resetJob, reloadFailures]);

  const cancelPreview = useCallback(() => {
    setActive(false);
    resetJob();
    setSceneFailures({});
    setSceneOverrides({});
  }, [resetJob]);

  const reportDisplayMode = useCallback(
    (filter: any) => {
      setLiveFilter(filter);
      if (
        active &&
        filter &&
        filter.displayMode !== enteredDisplayModeRef.current
      ) {
        cancelPreview();
      }
    },
    [active, cancelPreview],
  );

  const applyRenames = useCallback(async () => {
    const filter = liveFilter;
    const sceneFilter = filter ? filter.makeFilter() : null;
    const findFilter = filter ? filter.makeFindFilter() : null;
    startJob({
      scene_filter: sceneFilter,
      filter: findFilter ? { q: findFilter.q } : null,
    });
  }, [liveFilter, startJob]);

  const applyOne = useCallback(
    async (sceneId: string) => {
      setPendingSceneIds((prev) => new Set(prev).add(sceneId));
      try {
        await runRenameAndWait(client, { sceneIds: [sceneId] });
        await reloadFailures();
        const { data } = await client.query({
          query: FIND_SCENE_QUERY,
          variables: { id: sceneId },
          fetchPolicy: "network-only",
        });
        const freshScene = data && data.findScene;
        if (freshScene) {
          setSceneOverrides((prev) => ({ ...prev, [sceneId]: freshScene }));
        }
      } finally {
        setPendingSceneIds((prev) => {
          const next = new Set(prev);
          next.delete(sceneId);
          return next;
        });
      }
    },
    [client, reloadFailures],
  );

  const setSceneOverride = useCallback((sceneId: string, scene: any) => {
    setSceneOverrides((prev) => ({ ...prev, [sceneId]: scene }));
  }, []);

  const value: PreviewModeContextValue = {
    active,
    config,
    pendingSceneIds,
    sceneOverrides,
    jobId,
    job,
    result,
    sceneFailures,
    startPreview,
    cancelPreview,
    applyRenames,
    applyOne,
    setSceneOverride,
    reportDisplayMode,
    liveFilter,
  };

  return (
    <PreviewModeContext.Provider value={value}>
      {children}
    </PreviewModeContext.Provider>
  );
}

export function buildPreviewRows(
  scenes: any[],
  config: any,
  sceneOverrides: Record<string, any>,
  stashBoxes?: any[] | null,
) {
  return scenes.map((scene) => {
    const effectiveScene = sceneOverrides[scene.id] || scene;
    return {
      scene: effectiveScene,
      plan: planScene(effectiveScene, config, stashBoxes),
    };
  });
}
