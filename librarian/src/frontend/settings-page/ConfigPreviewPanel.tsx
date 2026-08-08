import React, { useEffect, useState } from "react";
import { configGateFilter } from "../../core/rule-to-filter.js";
import { useApolloClient } from "@apollo/client";
import { useManualEntityPreview } from "./useManualEntityPreview.js";
import { PlanResultTable } from "../shared/PlanResultTable.js";
import { PreviewSortSelect } from "./PreviewSortSelect.js";
import { ConfirmModal } from "../shared/ConfirmModal.js";
import { eligibleEntityNoun } from "../shared/eligible-entities.js";
import { adapterFor } from "../../core/entity-adapter.js";
import { runRenameTask } from "../shared/stash-api.js";
import { pollJob, isTerminalStatus, JobInfo } from "../shared/job-poll.js";
import {
  DEFAULT_PREVIEW_SORT,
  changeSortField,
  toggleSortDirection,
} from "./entity-preview-query.js";

interface ConfigPreviewPanelProps {
  config: any;
  entityType?: string;
}

const PluginApi = (window as any).PluginApi;
const { Button } = PluginApi.libraries.Bootstrap;
const { faFolderTree } = PluginApi.libraries.FontAwesomeSolid;

export function ConfigPreviewPanel({
  config,
  entityType,
}: ConfigPreviewPanelProps) {
  const type = entityType || "scenes";
  const client = useApolloClient();
  const [sort, setSort] = useState(DEFAULT_PREVIEW_SORT);
  const [closed, setClosed] = useState(true);
  const { rows, loading, run, handleEntityOrganized } = useManualEntityPreview(
    config,
    type,
  );
  const [confirming, setConfirming] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobInfo | null>(null);
  const running = !!jobId && (!job || !isTerminalStatus(job.status));

  const section: any = config[type] || {};
  const sectionDefaultPattern: any = section.defaultPattern || {};
  const plural = adapterFor(type).plural;

  // Shared with the rule preview so the two cannot drift apart. The StashID
  // gate is scene-only, since stash_id_count is not a field on the gallery or
  // image filter types and would make the query fail outright.
  const effectiveFilter = configGateFilter(
    type === "scenes" ? section : { onlyOrganized: section.onlyOrganized },
  );

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
    const id = await runRenameTask(client, { entity: type });
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
    entityFilter: effectiveFilter,
    folderPattern: sectionDefaultPattern.folderPattern,
    filenamePattern: sectionDefaultPattern.filenamePattern,
    sortBy: sectionDefaultPattern.sortBy,
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
          header={"Rename all " + plural + " now?"}
          cancel={{ text: "Cancel", onClick: () => setConfirming(false) }}
          accept={{
            text: "Rename all " + plural,
            variant: "danger",
            onClick: handleConfirmedRenameAll,
          }}
        >
          <p>
            Every {eligibleEntityNoun(config, false, type)} in your library will
            be renamed/moved on disk immediately: this is a real run, not a
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
              {loading ? "Previewing..." : "Preview matching " + plural}
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
            Rename all {plural}
          </Button>
        </div>
      </div>
      {visible && (
        <div className="librarian-config-preview">
          {rows.length === 0 ? (
            <div className="librarian-token-hint text-muted">
              No {plural} available to preview yet
            </div>
          ) : (
            <PlanResultTable
              rows={rows}
              onEntityOrganized={handleEntityOrganized}
              rules={section.rules}
              entityType={type}
            />
          )}
        </div>
      )}
    </div>
  );
}
