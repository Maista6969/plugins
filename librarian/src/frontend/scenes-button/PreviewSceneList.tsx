import React, { useEffect, useState } from "react";
import { useApolloClient, gql } from "@apollo/client";
import { useIntl } from "react-intl";
import { usePreviewMode, buildPreviewRows } from "./preview-context.js";
import { PlanResultTable } from "../shared/PlanResultTable.js";
import { countableNoun } from "../shared/eligible-entities.js";
import { SCENE_FIELDS } from "../shared/scene-query-fields.js";
import { useStashBoxes } from "../shared/StashBoxesContext.js";

// We can't rely on SlimSceneData because it does not include
// rating100 for performers so our previews that rely on sorting
// performers by their rating will be wrong
const ENRICH_SCENES_QUERY = gql(`
  query LibrarianEnrichScenes($ids: [ID!]) {
    findScenes(ids: $ids) {
      scenes { ${SCENE_FIELDS} }
    }
  }
`);

function summarize(rows: { plan: any }[]) {
  let willMove = 0;
  let unchanged = 0;
  let skipped = 0;
  let errors = 0;
  rows.forEach(({ plan }) => {
    if (plan.status === "skipped") {
      skipped++;
    } else if (plan.status === "error") {
      errors++;
    } else {
      const anyChanged = plan.files.some((f: any) => !f.unchanged);
      if (anyChanged) {
        willMove++;
      } else {
        unchanged++;
      }
    }
  });
  return { willMove, unchanged, skipped, errors };
}

interface PreviewSceneListProps {
  scenes: any[];
}

function sceneIdsKey(scenes: any[]): string {
  const ids = new Set<string>();
  scenes.forEach((scene) => {
    if (scene && scene.id != null) {
      ids.add(String(scene.id));
    }
  });
  return Array.from(ids).sort().join(",");
}

interface EnrichedScenes {
  // The key the map was fetched for, so a page change is told apart from a
  // page whose scenes genuinely came back empty
  key: string;
  byId: Record<string, any>;
}

export function PreviewSceneList({ scenes }: PreviewSceneListProps) {
  const intl = useIntl();
  const {
    config,
    pendingSceneIds,
    sceneOverrides,
    applyOne,
    setSceneOverride,
  } = usePreviewMode();
  const client = useApolloClient();
  // must stay above the early returns below: hooks cannot be called conditionally
  const { stashBoxes, loading: boxesLoading } = useStashBoxes();
  const [enriched, setEnriched] = useState<EnrichedScenes | null>(null);
  const idsKey = sceneIdsKey(scenes);

  useEffect(() => {
    if (!idsKey) {
      setEnriched({ key: "", byId: {} });
      return;
    }
    let cancelled = false;
    client
      .query({
        query: ENRICH_SCENES_QUERY,
        variables: { ids: idsKey.split(",") },
        fetchPolicy: "network-only",
      })
      .then(({ data }: any) => {
        if (cancelled) return;
        const found = (data && data.findScenes && data.findScenes.scenes) || [];
        const byId: Record<string, any> = {};
        found.forEach((scene: any) => {
          byId[String(scene.id)] = scene;
        });
        setEnriched({ key: idsKey, byId });
      })
      // Fall back to the props rather than sitting on the loading state
      // forever: a preview built from thinner data still beats no preview
      .catch(() => {
        if (!cancelled) setEnriched({ key: idsKey, byId: {} });
      });
    return () => {
      cancelled = true;
    };
  }, [client, idsKey]);

  if (!config) {
    return (
      <div className="librarian-preview-list">
        {intl.formatMessage({ id: "librarian.renameButton.loadingConfig" })}
      </div>
    );
  }

  if (scenes.length === 0) {
    return (
      <div className="librarian-preview-list">
        {intl.formatMessage(
          { id: "librarian.previewSceneList.noneMatch" },
          { entityNoun: countableNoun(intl, "scenes") },
        )}
      </div>
    );
  }

  // Anything fetched for a previous page is stale the moment the ids change,
  // and planning against it would show the wrong preview for a moment
  if (!enriched || enriched.key !== idsKey) {
    return (
      <div className="librarian-preview-list">
        {intl.formatMessage({
          id: "librarian.previewSceneList.loadingPreview",
        })}
      </div>
    );
  }

  const effectiveScenes = scenes.map((scene) => {
    return enriched.byId[String(scene.id)] || scene;
  });

  const rows = buildPreviewRows(
    effectiveScenes,
    config,
    sceneOverrides,
    boxesLoading ? null : stashBoxes,
  );
  const { willMove, unchanged, skipped, errors } = summarize(rows);

  return (
    <div className="librarian-preview-list">
      <p className="librarian-token-hint filter-container text-muted paginationIndex center-text">
        {intl.formatMessage(
          { id: "librarian.previewSceneList.summary" },
          {
            willMove,
            unchanged,
            skipped,
            errors,
            applyLabel: intl.formatMessage({
              id: "librarian.renameButton.apply",
            }),
          },
        )}
      </p>
      <PlanResultTable
        rows={rows}
        onMoveOne={applyOne}
        pendingSceneIds={pendingSceneIds}
        onEntityOrganized={setSceneOverride}
        rules={(config.scenes || {}).rules}
      />
    </div>
  );
}
