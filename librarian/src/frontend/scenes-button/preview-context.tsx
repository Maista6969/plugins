import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from "react";
import { useApolloClient, gql } from "@apollo/client";
import { planScene } from "../../core/plan-scene.js";
import { getConfiguration, runRenameTask } from "../shared/stash-api.js";
import { pollJob, isTerminalStatus, JobInfo } from "../shared/job-poll.js";
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
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobInfo | null>(null);
  const [pendingSceneIds, setPendingSceneIds] = useState<Set<string>>(
    new Set(),
  );
  const [sceneOverrides, setSceneOverrides] = useState<Record<string, any>>({});
  const stopPollRef = useRef<null | (() => void)>(null);
  const [liveFilter, setLiveFilter] = useState<any>(null);
  const enteredDisplayModeRef = useRef<unknown>(null);

  const startPreview = useCallback(async () => {
    setActive(true);
    setJobId(null);
    setJob(null);
    setSceneOverrides({});
    enteredDisplayModeRef.current = liveFilter ? liveFilter.displayMode : null;
    const freshConfig = await getConfiguration(client);
    setConfig(freshConfig);
  }, [client, liveFilter]);

  const cancelPreview = useCallback(() => {
    setActive(false);
    setJobId(null);
    setJob(null);
    setSceneOverrides({});
    if (stopPollRef.current) {
      stopPollRef.current();
      stopPollRef.current = null;
    }
  }, []);

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
    const id = await runRenameTask(client, {
      scene_filter: sceneFilter,
      filter: findFilter ? { q: findFilter.q } : null,
    });
    setJobId(id);
    stopPollRef.current = pollJob(client, id, (jobInfo) => {
      setJob(jobInfo);
      if (isTerminalStatus(jobInfo.status)) {
        client.refetchQueries({ include: ["FindScenes"] });
      }
    });
  }, [client, liveFilter]);

  const applyOne = useCallback(
    async (sceneId: string) => {
      setPendingSceneIds((prev) => new Set(prev).add(sceneId));
      try {
        const id = await runRenameTask(client, { sceneIds: [sceneId] });
        await new Promise<void>((resolve) => {
          pollJob(client, id, (jobInfo) => {
            if (isTerminalStatus(jobInfo.status)) {
              resolve();
            }
          });
        });
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
    [client],
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
) {
  return scenes.map((scene) => {
    const effectiveScene = sceneOverrides[scene.id] || scene;
    return { scene: effectiveScene, plan: planScene(effectiveScene, config) };
  });
}
