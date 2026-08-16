import React, { useCallback, useEffect, useState } from "react";
import { useApolloClient } from "@apollo/client";
import {
  findDuplicateScenes,
  findDuplicatePerformers,
  findDuplicateTags,
  findDuplicateStudios,
} from "./shared/stash-api.js";
import { DuplicateGroupList, DuplicateGroup } from "./DuplicateGroupList.js";

const PluginApi = (window as any).PluginApi;
const { Button } = PluginApi.libraries.Bootstrap;

export function DoppelgangerPage() {
  const client = useApolloClient();
  const [scenes, setScenes] = useState<DuplicateGroup[] | null>(null);
  const [performers, setPerformers] = useState<DuplicateGroup[] | null>(null);
  const [tags, setTags] = useState<DuplicateGroup[] | null>(null);
  const [studios, setStudios] = useState<DuplicateGroup[] | null>(null);

  const refresh = useCallback(() => {
    setScenes(null);
    setPerformers(null);
    setTags(null);
    setStudios(null);
    findDuplicateScenes(client).then(setScenes);
    findDuplicatePerformers(client).then(setPerformers);
    findDuplicateTags(client).then(setTags);
    findDuplicateStudios(client).then(setStudios);
  }, [client]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
        mergeKind="scene"
        onMerged={refresh}
      />

      <DuplicateGroupList
        title="Duplicate performers"
        description="Performers matched to the same stash-box entry more than once."
        entityPath="performers"
        groups={performers}
        mergeKind="performer"
        onMerged={refresh}
      />

      <DuplicateGroupList
        title="Duplicate tags"
        description="Tags matched to the same stash-box entry more than once."
        entityPath="tags"
        groups={tags}
        mergeKind="tag"
        onMerged={refresh}
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
