import React, { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { configGateFilter } from "../../core/rule-to-filter.js";
import { useApolloClient } from "@apollo/client";
import { useManualEntityPreview } from "./useManualEntityPreview.js";
import { PlanResultTable } from "../shared/PlanResultTable.js";
import { PreviewSortSelect } from "./PreviewSortSelect.js";
import { ConfirmModal } from "../shared/ConfirmModal.js";
import {
  eligibleEntityNoun,
  countableNoun,
} from "../shared/eligible-entities.js";
import { runRenameTask } from "../shared/stash-api.js";
import { pollJob, isTerminalStatus, JobInfo } from "../shared/job-poll.js";
import {
  DEFAULT_PREVIEW_SORT,
  PREVIEW_REFRESH_DEBOUNCE_MS,
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
  const intl = useIntl();
  const client = useApolloClient();
  const [sort, setSort] = useState(DEFAULT_PREVIEW_SORT);
  const [closed, setClosed] = useState(true);
  const { rows, loading, run, replan, handleEntityOrganized } =
    useManualEntityPreview(config, type);
  const [confirming, setConfirming] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobInfo | null>(null);
  const running = !!jobId && (!job || !isTerminalStatus(job.status));

  const section: any = config[type] || {};
  const plural = countableNoun(intl, type);

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
      return intl.formatMessage({ id: "librarian.common.starting" });
    }
    if (!isTerminalStatus(job.status)) {
      const pct =
        job.progress != null ? Math.round(job.progress * 100) + "%" : "...";
      return intl.formatMessage(
        { id: "librarian.renameButton.jobStatus.running" },
        { progress: pct },
      );
    }
    return intl.formatMessage(
      { id: "librarian.renameButton.jobStatus.terminal" },
      { status: job.status.toLowerCase() },
    );
  }

  // Re-query only when the matching set could have changed; otherwise re-plan
  // the rows already in hand. This preview plans against the whole section, so
  // rules are part of the planning key: editing or reordering one changes it.
  const filterKey = JSON.stringify({
    entityType: type,
    filter: effectiveFilter,
  });
  const planKey = JSON.stringify({
    rules: section.rules,
    defaultPattern: section.defaultPattern,
    delimiters: config.delimiters,
    sanitize: config.sanitize,
  });

  useEffect(() => {
    if (rows === null || closed) {
      return;
    }
    const timer = setTimeout(() => {
      run(effectiveFilter, sort);
    }, PREVIEW_REFRESH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    if (rows !== null && !closed) {
      replan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

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
          header={intl.formatMessage(
            { id: "librarian.configPreviewPanel.confirm.header" },
            { entityNoun: plural },
          )}
          cancel={{
            text: intl.formatMessage({ id: "actions.cancel" }),
            onClick: () => setConfirming(false),
          }}
          accept={{
            text: intl.formatMessage(
              { id: "librarian.configPreviewPanel.renameAll" },
              { entityNoun: plural },
            ),
            variant: "danger",
            onClick: handleConfirmedRenameAll,
          }}
        >
          <p>
            {intl.formatMessage(
              { id: "librarian.renameButton.confirm.body" },
              {
                entityNoun: eligibleEntityNoun(intl, config, false, type),
                filterActive: "false",
              },
            )}
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
              {loading
                ? intl.formatMessage({
                    id: "librarian.configPreviewPanel.previewing",
                  })
                : intl.formatMessage(
                    { id: "librarian.configPreviewPanel.previewMatching" },
                    { entityNoun: plural },
                  )}
            </Button>
          )}{" "}
          {visible && (
            <Button
              variant="secondary"
              onClick={() => setClosed(true)}
              title={intl.formatMessage({
                id: "librarian.configPreviewPanel.closePreviewTitle",
              })}
            >
              {intl.formatMessage({
                id: "librarian.configPreviewPanel.closePreview",
              })}
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
            {intl.formatMessage(
              { id: "librarian.configPreviewPanel.renameAll" },
              { entityNoun: plural },
            )}
          </Button>
        </div>
      </div>
      {visible && (
        <div className="librarian-config-preview">
          {rows.length === 0 ? (
            <div className="librarian-token-hint text-muted">
              {intl.formatMessage(
                { id: "librarian.configPreviewPanel.noneToPreview" },
                { entityNoun: plural },
              )}
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
