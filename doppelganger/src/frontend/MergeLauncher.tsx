import React, { useCallback, useMemo, useRef } from "react";
import { useQuery } from "@apollo/client";
import {
  SCENES_FOR_MERGE,
  PERFORMERS_FOR_MERGE,
  TAGS_FOR_MERGE,
} from "./shared/stash-api.js";
import type { DuplicateGroup } from "./DuplicateGroupList.js";

const PluginApi = (window as any).PluginApi;
const { Spinner } = PluginApi.libraries.Bootstrap;

export interface MergeLauncherProps {
  group: DuplicateGroup;
  onClose: (merged: boolean) => void;
}

// Stash's merge modals call onClose(id) on success and then onClose() again
// unconditionally, so the id has to be latched -- reading the last call would
// report every successful merge as a cancellation.
function useSettledClose(onClose: (merged: boolean) => void) {
  const merged = useRef(false);
  const settled = useRef(false);

  return useCallback(
    (mergedID?: string) => {
      if (mergedID) merged.current = true;
      if (settled.current) return;
      settled.current = true;
      onClose(merged.current);
    },
    [onClose],
  );
}

function useMergeComponent(loadableKey: string, componentKey: string) {
  const loadable = PluginApi.loadableComponents[loadableKey];
  const loading = PluginApi.hooks.useLoadComponents(
    useMemo(() => (loadable ? [loadable] : []), [loadable]),
  );
  return { loading, Component: PluginApi.components[componentKey] };
}

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

function UnsupportedNotice() {
  return (
    <p className="text-muted">
      This version of Stash does not expose its merge dialog to plugins.
    </p>
  );
}

export function SceneMergeLauncher({ group, onClose }: MergeLauncherProps) {
  const handleClose = useSettledClose(onClose);
  const { loading, Component } = useMergeComponent(
    "SceneMergeDialog",
    "SceneMergeModal",
  );

  const ids = useMemo(() => group.items.map((i) => i.id), [group]);
  const { data, loading: fetching } = useQuery(SCENES_FOR_MERGE, {
    variables: { ids },
    fetchPolicy: "network-only",
  });

  // findScenes does not preserve the requested id order, but the modal takes
  // scenes[0] as the default destination -- so reorder back to the group's
  // order, which puts the lowest id (the oldest entry) first.
  const scenes = useMemo(() => {
    const byId = new Map<string, any>(
      (data?.findScenes?.scenes ?? []).map((s: any) => [s.id, s]),
    );
    return group.items
      .map((i) => byId.get(i.id))
      .filter(Boolean)
      .map((s: any) => ({
        id: s.id,
        title: s.title || fileNameFromPath(s.files?.[0]?.path ?? "") || "",
      }));
  }, [data, group]);

  if (loading || fetching) return <Spinner animation="border" size="sm" />;
  if (!Component) return <UnsupportedNotice />;

  return <Component show scenes={scenes} onClose={handleClose} />;
}

export function TagMergeLauncher({ group, onClose }: MergeLauncherProps) {
  const handleClose = useSettledClose(onClose);
  const { loading, Component } = useMergeComponent(
    "TagMergeDialog",
    "TagMergeModal",
  );

  const ids = useMemo(() => group.items.map((i) => i.id), [group]);
  const { data, loading: fetching } = useQuery(TAGS_FOR_MERGE, {
    variables: { ids },
    fetchPolicy: "network-only",
  });

  const tags = useMemo(() => {
    const byId = new Map<string, any>(
      (data?.findTags?.tags ?? []).map((t: any) => [t.id, t]),
    );
    return group.items.map((i) => byId.get(i.id)).filter(Boolean);
  }, [data, group]);

  if (loading || fetching) return <Spinner animation="border" size="sm" />;
  if (!Component) return <UnsupportedNotice />;

  return <Component show tags={tags} onClose={handleClose} />;
}

export function PerformerMergeLauncher({
  group,
  onClose,
}: MergeLauncherProps) {
  const handleClose = useSettledClose(onClose);
  const { loading, Component } = useMergeComponent(
    "PerformerMergeDialog",
    "PerformerMergeModal",
  );

  const ids = useMemo(() => group.items.map((i) => i.id), [group]);
  const { data, loading: fetching } = useQuery(PERFORMERS_FOR_MERGE, {
    variables: { ids },
    fetchPolicy: "network-only",
  });

  const performers = useMemo(() => {
    const byId = new Map<string, any>(
      (data?.findPerformers?.performers ?? []).map((p: any) => [p.id, p]),
    );
    return group.items.map((i) => byId.get(i.id)).filter(Boolean);
  }, [data, group]);

  if (loading || fetching) return <Spinner animation="border" size="sm" />;
  if (!Component) return <UnsupportedNotice />;

  return <Component show performers={performers} onClose={handleClose} />;
}
