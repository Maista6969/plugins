import React, { useCallback, useEffect, useState } from "react";
import { useApolloClient } from "@apollo/client";
import {
  findDuplicateScenes,
  findDuplicatePerformers,
  findDuplicateStudios,
  mergeScenes,
  mergePerformers,
} from "./shared/stash-api.js";
import { DuplicateGroupList, DuplicateGroup } from "./DuplicateGroupList.js";

const PluginApi = (window as any).PluginApi;
const { Button } = PluginApi.libraries.Bootstrap;

export function DoppelgangerPage() {
  const client = useApolloClient();
  const [scenes, setScenes] = useState<DuplicateGroup[] | null>(null);
  const [performers, setPerformers] = useState<DuplicateGroup[] | null>(null);
  const [studios, setStudios] = useState<DuplicateGroup[] | null>(null);

  const refresh = useCallback(() => {
    setScenes(null);
    setPerformers(null);
    setStudios(null);
    findDuplicateScenes(client).then(setScenes);
    findDuplicatePerformers(client).then(setPerformers);
    findDuplicateStudios(client).then(setStudios);
  }, [client]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleMergeScenes(source: string[], destination: string) {
    await mergeScenes(client, source, destination);
    refresh();
  }

  async function handleMergePerformers(source: string[], destination: string) {
    await mergePerformers(client, source, destination);
    refresh();
  }

  return (
    <div className="doppelganger-page">
      <div className="doppelganger-page-header">
        <h2>Doppelganger</h2>
        <Button variant="secondary" onClick={refresh}>
          Refresh
        </Button>
      </div>

      <DuplicateGroupList
        title="Duplicate scenes"
        description="Scenes matched to the same stash-box entry more than once."
        entityPath="scenes"
        groups={scenes}
        onMerge={handleMergeScenes}
      />

      <DuplicateGroupList
        title="Duplicate performers"
        description="Performers matched to the same stash-box entry more than once."
        entityPath="performers"
        groups={performers}
        onMerge={handleMergePerformers}
      />

      <DuplicateGroupList
        title="Duplicate studios"
        description="Studios matched to the same stash-box entry more than once. Stash has no built-in studio merge, so these need to be resolved manually."
        entityPath="studios"
        groups={studios}
      />
    </div>
  );
}
