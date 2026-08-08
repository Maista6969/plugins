import React, { useEffect, useState } from "react";
import { configGateFilter } from "../../core/rule-to-filter.js";
import { useApolloClient } from "@apollo/client";
import { useManualScenePreview } from "./useManualScenePreview.js";
import { PlanResultTable } from "../shared/PlanResultTable.js";
import { PreviewSortSelect } from "./PreviewSortSelect.js";
import { ConfirmModal } from "../shared/ConfirmModal.js";
import { eligibleSceneNoun } from "../shared/eligible-scenes.js";
import { runRenameTask } from "../shared/stash-api.js";
import { pollJob, isTerminalStatus, JobInfo } from "../shared/job-poll.js";
import {
  DEFAULT_PREVIEW_SORT,
  changeSortField,
  toggleSortDirection,
} from "./scene-preview-query.js";

interface ConfigPreviewPanelProps {
  config: any;
}

const PluginApi = (window as any).PluginApi;
const { Button } = PluginApi.libraries.Bootstrap;
const { faFolderTree } = PluginApi.libraries.FontAwesomeSolid;

export function ConfigPreviewPanel({ config }: ConfigPreviewPanelProps) {
  const client = useApolloClient();
  const [sort, setSort] = useState(DEFAULT_PREVIEW_SORT);
  const [closed, setClosed] = useState(true);
  const { rows, loading, run, handleSceneOrganized } =
    useManualScenePreview(config);
  const [confirming, setConfirming] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobInfo | null>(null);
  const running = !!jobId && (!job || !isTerminalStatus(job.status));

  // shared with the rule preview so the two cannot drift apart
  const effectiveFilter = configGateFilter(config);

  const visible = rows !== null && !closed;

  function handlePreviewClick() {
    setClosed(false);
    run(effectiveFilter, sort);
  }

  function handleReshuffle() {
    run(effectiveFilter, sort);
  }

  async function handleConfirmedRenameAll() {
    setConfirming(false);
    setJob(null);
    const id = await runRenameTask(client, {});
    setJobId(id);
    pollJob(client, id, setJob);
  }

  function renameAllStatusText(): string | null {
    if (!jobId) {
      return null;
    }
    if (!job) {
      return "Starting...";
    }
    if (!isTerminalStatus(job.status)) {
      const pct =
        job.progress != null ? Math.round(job.progress * 100) + "%" : "...";
      return "Renaming... " + pct;
    }
    return "Rename job " + job.status.toLowerCase();
  }

  const contentKey = JSON.stringify({
    sceneFilter: effectiveFilter,
    folderPattern: config.defaultPattern.folderPattern,
    filenamePattern: config.defaultPattern.filenamePattern,
    sortBy: config.defaultPattern.sortBy,
    spaceReplacement: config.sanitize && config.sanitize.spaceReplacement,
  });
  useEffect(() => {
    setClosed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey]);

  const sortKey = JSON.stringify(sort);
  useEffect(() => {
    if (rows !== null && !closed) {
      run(effectiveFilter, sort);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey]);

  const renameAllStatus = renameAllStatusText();

  return (
    <div>
      {confirming && (
        <ConfirmModal
          show
          icon={faFolderTree}
          header="Rename all scenes now?"
          cancel={{ text: "Cancel", onClick: () => setConfirming(false) }}
          accept={{
            text: "Rename all scenes",
            variant: "danger",
            onClick: handleConfirmedRenameAll,
          }}
        >
          <p>
            Every {eligibleSceneNoun(config)} in your library will be
            renamed/moved on disk immediately: this is a real run, not a
            preview, and it is NOT reversable by this plugin
          </p>
        </ConfirmModal>
      )}
      <div className="librarian-config-preview-controls">
        <div className="librarian-config-preview-controls-left">
          <PreviewSortSelect
            field={sort.field}
            direction={sort.direction}
            onChangeField={(field) => setSort(changeSortField(field))}
            onToggleDirection={() => setSort(toggleSortDirection(sort))}
            onReshuffle={visible ? handleReshuffle : undefined}
            reshuffling={loading}
          />{" "}
          {!visible && (
            <Button
              variant="secondary"
              disabled={loading}
              onClick={handlePreviewClick}
            >
              {loading ? "Previewing..." : "Preview matching scenes"}
            </Button>
          )}{" "}
          {visible && (
            <Button
              variant="secondary"
              onClick={() => setClosed(true)}
              title="Close this preview"
            >
              Close preview
            </Button>
          )}
        </div>
        <div className="librarian-config-preview-controls-right">
          {renameAllStatus && (
            <span className="librarian-token-hint text-muted">
              {renameAllStatus}
            </span>
          )}
          <Button
            variant="primary"
            disabled={running}
            onClick={() => setConfirming(true)}
          >
            Rename all scenes
          </Button>
        </div>
      </div>
      {visible && (
        <div className="librarian-config-preview">
          {rows.length === 0 ? (
            <div className="librarian-token-hint text-muted">
              No scenes available to preview yet
            </div>
          ) : (
            <PlanResultTable
              rows={rows}
              onSceneOrganized={handleSceneOrganized}
              rules={config.rules}
            />
          )}
        </div>
      )}
    </div>
  );
}
