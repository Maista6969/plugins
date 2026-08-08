import React, { useEffect, useState } from "react";
import { useApolloClient, gql } from "@apollo/client";
import { usePreviewMode, buildPreviewRows } from "./preview-context.js";
import { PlanResultTable } from "../shared/PlanResultTable.js";
import { STUDIO_FIELDS } from "../shared/scene-query-fields.js";

const ENRICH_STUDIOS_QUERY = gql(`
  query LibrarianEnrichStudios($ids: [ID!]) {
    findStudios(ids: $ids) {
      studios { ${STUDIO_FIELDS} }
    }
  }
`);

const ENRICH_TAGS_QUERY = gql(`
  query LibrarianEnrichTags($ids: [ID!]) {
    findTags(ids: $ids) {
      tags { id sort_name }
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

function distinctStudioIdsKey(scenes: any[]): string {
  const ids = new Set<string>();
  scenes.forEach((scene) => {
    if (scene.studio && scene.studio.id) {
      ids.add(String(scene.studio.id));
    }
  });
  return Array.from(ids).sort().join(",");
}

function distinctTagIdsKey(scenes: any[]): string {
  const ids = new Set<string>();
  scenes.forEach((scene) => {
    (scene.tags || []).forEach((tag: any) => {
      if (tag && tag.id) {
        ids.add(String(tag.id));
      }
    });
  });
  return Array.from(ids).sort().join(",");
}

export function PreviewSceneList({ scenes }: PreviewSceneListProps) {
  const {
    config,
    pendingSceneIds,
    sceneOverrides,
    applyOne,
    setSceneOverride,
  } = usePreviewMode();
  const client = useApolloClient();
  const [enrichedStudiosById, setEnrichedStudiosById] = useState<
    Record<string, any>
  >({});
  const [enriching, setEnriching] = useState(false);
  const studioIdsKey = distinctStudioIdsKey(scenes);

  useEffect(() => {
    if (!studioIdsKey) {
      setEnrichedStudiosById({});
      return;
    }
    let cancelled = false;
    setEnriching(true);
    client
      .query({
        query: ENRICH_STUDIOS_QUERY,
        variables: { ids: studioIdsKey.split(",") },
        fetchPolicy: "network-only",
      })
      .then(({ data }: any) => {
        if (cancelled) return;
        const studios =
          (data && data.findStudios && data.findStudios.studios) || [];
        const byId: Record<string, any> = {};
        studios.forEach((studio: any) => {
          byId[studio.id] = studio;
        });
        setEnrichedStudiosById(byId);
      })
      .finally(() => {
        if (!cancelled) setEnriching(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, studioIdsKey]);

  const [enrichedTagSortNamesById, setEnrichedTagSortNamesById] = useState<
    Record<string, string | null>
  >({});
  const [enrichingTags, setEnrichingTags] = useState(false);
  const tagIdsKey = distinctTagIdsKey(scenes);

  useEffect(() => {
    if (!tagIdsKey) {
      setEnrichedTagSortNamesById({});
      return;
    }
    let cancelled = false;
    setEnrichingTags(true);
    client
      .query({
        query: ENRICH_TAGS_QUERY,
        variables: { ids: tagIdsKey.split(",") },
        fetchPolicy: "network-only",
      })
      .then(({ data }: any) => {
        if (cancelled) return;
        const tags = (data && data.findTags && data.findTags.tags) || [];
        const byId: Record<string, string | null> = {};
        tags.forEach((tag: any) => {
          byId[tag.id] = tag.sort_name;
        });
        setEnrichedTagSortNamesById(byId);
      })
      .finally(() => {
        if (!cancelled) setEnrichingTags(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, tagIdsKey]);

  if (!config) {
    return (
      <div className="librarian-preview-list">Loading configuration...</div>
    );
  }

  if (scenes.length === 0) {
    return (
      <div className="librarian-preview-list">
        No scenes match the current filter
      </div>
    );
  }

  if (
    (enriching &&
      Object.keys(enrichedStudiosById).length === 0 &&
      studioIdsKey) ||
    (enrichingTags &&
      Object.keys(enrichedTagSortNamesById).length === 0 &&
      tagIdsKey)
  ) {
    return (
      <div className="librarian-preview-list">Loading preview data...</div>
    );
  }

  const effectiveScenes = scenes.map((scene) => {
    const enrichedStudio = scene.studio && enrichedStudiosById[scene.studio.id];
    const enrichedTags = (scene.tags || []).map((tag: any) => {
      const sortName = enrichedTagSortNamesById[tag.id];
      return sortName !== undefined ? { ...tag, sort_name: sortName } : tag;
    });
    return {
      ...scene,
      studio: enrichedStudio || scene.studio,
      tags: enrichedTags,
    };
  });

  const rows = buildPreviewRows(effectiveScenes, config, sceneOverrides);
  const { willMove, unchanged, skipped, errors } = summarize(rows);

  return (
    <div className="librarian-preview-list">
      <p className="librarian-token-hint filter-container text-muted paginationIndex center-text">
        This page: {willMove} will move, {unchanged} unchanged, {skipped}{" "}
        skipped
        {errors > 0 ? ", " + errors + " errors" : ""}. "Apply Renames" acts on
        every scene matching the current filter, across all pages, not just
        what's shown here
      </p>
      <PlanResultTable
        rows={rows}
        onMoveOne={applyOne}
        pendingSceneIds={pendingSceneIds}
        onSceneOrganized={setSceneOverride}
        rules={(config.scenes || {}).rules}
      />
    </div>
  );
}
