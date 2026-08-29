import React, { useEffect, useState } from "react";
import { useApolloClient, gql } from "@apollo/client";
import { useIntl } from "react-intl";
import { RenamableFilterButton } from "./RenamableFilterButton.js";
import { usePreviewMode } from "./preview-context.js";
import { isTerminalStatus } from "../shared/job-poll.js";
import { ConfirmModal } from "../shared/ConfirmModal.js";
import { eligibleEntityNoun } from "../shared/eligible-entities.js";

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
  const intl = useIntl();
  return (
    <OverlayTrigger
      overlay={
        <Tooltip id="librarian-toggle-tooltip">
          {intl.formatMessage({ id: "librarian.renameButton.tooltip" })}
        </Tooltip>
      }
    >
      <Button variant="secondary" active={active} onClick={onClick}>
        <Icon icon={faFolderTree} />
      </Button>
    </OverlayTrigger>
  );
}

export function RenameScenesButton() {
  const intl = useIntl();
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
      {active && (
        <RenamableFilterButton config={config} liveFilter={liveFilter} />
      )}
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
          {intl.formatMessage({ id: "librarian.renameButton.loadingConfig" })}
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
            ? intl.formatMessage(
                { id: "librarian.renameButton.jobStatus.terminal" },
                { status: status.toLowerCase() },
              )
            : intl.formatMessage(
                { id: "librarian.renameButton.jobStatus.running" },
                { progress: progressPct },
              )}
        </span>
        {toggle}
      </>
    );
  }

  const filterActive = hasActiveFilter(liveFilter);
  const summaryText = !filterActive
    ? intl.formatMessage(
        { id: "librarian.renameButton.summary.all" },
        { entityNoun: eligibleEntityNoun(intl, config, true) },
      )
    : matchCount != null
      ? intl.formatMessage(
          { id: "librarian.renameButton.summary.filteredCount" },
          { count: matchCount },
        )
      : intl.formatMessage({
          id: "librarian.renameButton.summary.filteredUnknown",
        });

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
          header={intl.formatMessage({
            id: "librarian.renameButton.confirm.header",
          })}
          cancel={{
            text: intl.formatMessage({ id: "actions.cancel" }),
            onClick: () => setConfirming(false),
          }}
          accept={{
            text: intl.formatMessage({ id: "actions.apply" }),
            variant: "danger",
            onClick: handleConfirmedApply,
          }}
        >
          <p>
            {intl.formatMessage(
              { id: "librarian.renameButton.confirm.body" },
              {
                entityNoun: eligibleEntityNoun(intl, config),
                filterActive: filterActive ? "true" : "false",
              },
            )}
          </p>
        </ConfirmModal>
      )}
      <span className="librarian-summary text-muted">{summaryText}</span>
      <Button variant="primary" size="sm" onClick={() => setConfirming(true)}>
        {intl.formatMessage({ id: "librarian.renameButton.apply" })}
      </Button>
      {toggle}
    </>
  );
}
