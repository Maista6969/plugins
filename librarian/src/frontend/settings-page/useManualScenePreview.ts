import { useState } from "react";
import { useApolloClient } from "@apollo/client";
import { planScene } from "../../core/plan-scene.js";
import {
  fetchPreviewRows,
  fetchScopedPreviewRows,
  PreviewSort,
} from "./scene-preview-query.js";

export function useManualScenePreview(config: any) {
  const client = useApolloClient();
  // null = never run yet (distinct from [] = ran, zero matches).
  const [rows, setRows] = useState<{ scene: any; plan: any }[] | null>(null);
  const [loading, setLoading] = useState(false);

  function run(
    sceneFilter: any,
    sort?: PreviewSort,
    isStolen?: (plan: any) => boolean,
  ) {
    setLoading(true);
    const promise = isStolen
      ? fetchScopedPreviewRows(client, sceneFilter, config, sort, isStolen)
      : fetchPreviewRows(client, sceneFilter, config, sort);
    promise
      .then((plans: { scene: any; plan: any }[]) => {
        setRows(plans);
      })
      .finally(() => {
        setLoading(false);
      });
  }

  function handleSceneOrganized(sceneId: string, patchedScene: any) {
    setRows(
      (prev) =>
        prev &&
        prev.map((row) =>
          row.scene.id === sceneId
            ? { scene: patchedScene, plan: planScene(patchedScene, config) }
            : row,
        ),
    );
  }

  return { rows, loading, run, handleSceneOrganized };
}
