import React, { useCallback, useMemo, useRef } from "react";
import { useQuery } from "@apollo/client";
import { PERFORMERS_FOR_MERGE, TAGS_FOR_MERGE } from "./shared/stash-api.js";
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

  // The modal only uses `title` to label the two pickers in its first step --
  // the second step re-queries full scenes itself -- and duplicates share a
  // title by definition, so it gets the file path the list already resolved.
  // Group order puts the lowest id first, which the modal takes as the default
  // destination.
  const scenes = useMemo(
    () =>
      group.items.map((i) => ({
        id: i.id,
        title: i.label || `#${i.id}`,
      })),
    [group],
  );

  if (loading) return <Spinner animation="border" size="sm" />;
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

export function PerformerMergeLauncher({ group, onClose }: MergeLauncherProps) {
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
