import { useState } from "react";
import { useApolloClient } from "@apollo/client";
import { planEntity } from "../../core/plan-scene.js";
import {
  fetchPreviewRows,
  fetchScopedPreviewRows,
  PreviewSort,
} from "./entity-preview-query.js";

export function useManualEntityPreview(
  config: any,
  entityType: string = "scenes",
) {
  const client = useApolloClient();
  // null = never run yet (distinct from [] = ran, zero matches).
  const [rows, setRows] = useState<{ scene: any; plan: any }[] | null>(null);
  const [loading, setLoading] = useState(false);

  function run(
    entityFilter: any,
    sort?: PreviewSort,
    isStolen?: (plan: any) => boolean,
  ) {
    setLoading(true);
    const promise = isStolen
      ? fetchScopedPreviewRows(
          client,
          entityFilter,
          config,
          sort,
          isStolen,
          entityType,
        )
      : fetchPreviewRows(client, entityFilter, config, sort, entityType);
    promise
      .then((plans: { scene: any; plan: any }[]) => {
        setRows(plans);
      })
      .finally(() => {
        setLoading(false);
      });
  }

  function handleEntityOrganized(entityId: string, patchedEntity: any) {
    setRows(
      (prev) =>
        prev &&
        prev.map((row) =>
          row.scene.id === entityId
            ? {
                scene: patchedEntity,
                plan: planEntity(patchedEntity, config, entityType),
              }
            : row,
        ),
    );
  }

  return { rows, loading, run, handleEntityOrganized };
}
