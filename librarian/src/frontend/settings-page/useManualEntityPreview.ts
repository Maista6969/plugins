import { useEffect, useRef, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { planEntity } from "../../core/plan-scene.js";
import { useStashBoxes } from "../shared/StashBoxesContext.js";
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
  const { stashBoxes, loading: boxesLoading } = useStashBoxes();
  // null means "we don't know the list yet", which resolves no {stash_id|from=}
  const boxes = boxesLoading ? null : stashBoxes;
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
          boxes,
        )
      : fetchPreviewRows(client, entityFilter, config, sort, entityType, boxes);
    promise
      .then((plans: { scene: any; plan: any }[]) => {
        setRows(plans);
      })
      .finally(() => {
        setLoading(false);
      });
  }

  // Plans are computed client-side, so a pattern or formatting change only needs
  // the rows in hand re-planned: no reason to re-query for the same entities
  function replan() {
    setRows(
      (prev) =>
        prev &&
        prev.map((row) => ({
          scene: row.scene,
          plan: planEntity(row.scene, config, entityType, boxes),
        })),
    );
  }

  const boxesKey = boxes
    ? boxes
        .map((b: any) => b.endpoint)
        .sort()
        .join("|")
    : "";
  const lastBoxesKey = useRef(boxesKey);
  useEffect(() => {
    if (lastBoxesKey.current === boxesKey) {
      return;
    }
    lastBoxesKey.current = boxesKey;
    replan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxesKey]);

  function handleEntityOrganized(entityId: string, patchedEntity: any) {
    setRows(
      (prev) =>
        prev &&
        prev.map((row) =>
          row.scene.id === entityId
            ? {
                scene: patchedEntity,
                plan: planEntity(patchedEntity, config, entityType, boxes),
              }
            : row,
        ),
    );
  }

  return { rows, loading, run, replan, handleEntityOrganized };
}
