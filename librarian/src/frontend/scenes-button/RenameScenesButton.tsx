import React, { useEffect, useState } from "react";
import { useApolloClient, gql } from "@apollo/client";
import { usePreviewMode } from "./preview-context.js";
import { isTerminalStatus } from "../shared/job-poll.js";
import { ConfirmModal } from "../shared/ConfirmModal.js";
import { eligibleSceneNoun } from "../shared/eligible-scenes.js";

const PluginApi = (window as any).PluginApi;
const { Button, ButtonGroup, OverlayTrigger, Tooltip } =
  PluginApi.libraries.Bootstrap;
const { faFolderTree } = PluginApi.libraries.FontAwesomeSolid;
const Icon = PluginApi.components.Icon;

function hasActiveFilter(filter: any): boolean {
  return !!filter && (filter.criteria.length > 0 || !!filter.searchTerm);
}

const FILTERED_SCENE_COUNT_QUERY = gql(`
  query LibrarianFilteredSceneCount($scene_filter: SceneFilterType, $filter: FindFilterType) {
    findScenes(scene_filter: $scene_filter, filter: $filter) {
      count
    }
  }
`);

function useFilteredSceneCount(filter: any): number | null {
  const client = useApolloClient();
  const [count, setCount] = useState<number | null>(null);
  const active = hasActiveFilter(filter);
  const sceneFilter = active ? filter.makeFilter() : null;
  const searchTerm = active ? filter.searchTerm : "";
  const sceneFilterKey = JSON.stringify(sceneFilter);

  useEffect(() => {
    if (!active) {
      setCount(null);
      return;
    }
    let cancelled = false;
    client
      .query({
        query: FILTERED_SCENE_COUNT_QUERY,
        variables: { scene_filter: sceneFilter, filter: { q: searchTerm } },
        fetchPolicy: "network-only",
      })
      .then(({ data }: any) => {
        if (!cancelled)
          setCount(data && data.findScenes ? data.findScenes.count : null);
      })
      .catch(() => {
        if (!cancelled) setCount(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, active, sceneFilterKey, searchTerm]);

  return count;
}

function ToggleButton({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <OverlayTrigger
      overlay={<Tooltip id="librarian-toggle-tooltip">Rename Scenes</Tooltip>}
    >
      <Button variant="secondary" active={active} onClick={onClick}>
        <Icon icon={faFolderTree} />
      </Button>
    </OverlayTrigger>
  );
}

export function RenameScenesButton() {
  const {
    active,
    config,
    jobId,
    job,
    startPreview,
    cancelPreview,
    applyRenames,
    liveFilter,
  } = usePreviewMode();
  const matchCount = useFilteredSceneCount(liveFilter);
  const [confirming, setConfirming] = useState(false);

  const toggle = (
    <ButtonGroup>
      <ToggleButton
        active={active}
        onClick={active ? cancelPreview : startPreview}
      />
    </ButtonGroup>
  );

  if (!active) {
    return toggle;
  }

  if (!config) {
    return (
      <>
        <span className="librarian-summary text-muted">
          Loading configuration...
        </span>
        {toggle}
      </>
    );
  }

  if (jobId) {
    const status = job ? job.status : "RUNNING";
    const progressPct =
      job && job.progress != null
        ? Math.round(job.progress * 100) + "%"
        : "...";
    const terminal = isTerminalStatus(job && job.status);
    return (
      <>
        <span className="librarian-summary text-muted">
          {terminal
            ? "Rename job " + status.toLowerCase()
            : "Renaming... " + progressPct}
        </span>
        {toggle}
      </>
    );
  }

  const filterActive = hasActiveFilter(liveFilter);
  const summaryText = !filterActive
    ? `This will rename all ${eligibleSceneNoun(config, true)}`
    : matchCount != null
      ? `This will rename up to ${matchCount} scene${matchCount === 1 ? "" : "s"} matching the current filter`
      : "This will rename scenes matching the current filter";

  function handleConfirmedApply() {
    setConfirming(false);
    applyRenames();
  }

  return (
    <>
      {confirming && (
        <ConfirmModal
          show
          icon={faFolderTree}
          header="Apply renames now?"
          cancel={{ text: "Cancel", onClick: () => setConfirming(false) }}
          accept={{
            text: "Apply",
            variant: "danger",
            onClick: handleConfirmedApply,
          }}
        >
          <p>
            Every {eligibleSceneNoun(config)}{" "}
            {filterActive ? "currently matching the filter" : "in your library"}{" "}
            will be renamed/moved on disk immediately: this is a real run, not a
            preview, and it is NOT reversable by this plugin
          </p>
        </ConfirmModal>
      )}
      <span className="librarian-summary text-muted">{summaryText}</span>
      <Button variant="primary" size="sm" onClick={() => setConfirming(true)}>
        Apply Renames
      </Button>
      {toggle}
    </>
  );
}
