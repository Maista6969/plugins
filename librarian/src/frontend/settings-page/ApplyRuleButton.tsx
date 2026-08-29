import React, { useState } from "react";
import { useApolloClient } from "@apollo/client";
import { useIntl } from "react-intl";
import { ruleToPreviewFilter } from "../../core/rule-to-filter.js";
import { runRenameTask } from "../shared/stash-api.js";
import { pollJob, isTerminalStatus, JobInfo } from "../shared/job-poll.js";
import { ConfirmModal } from "../shared/ConfirmModal.js";
import {
  eligibleEntityNoun,
  countableNoun,
} from "../shared/eligible-entities.js";

const PluginApi = (window as any).PluginApi;
const { Button } = PluginApi.libraries.Bootstrap;
const { faFolderTree } = PluginApi.libraries.FontAwesomeSolid;

interface ApplyRuleButtonProps {
  rule: any;
  config: any;
  entityType?: string;
}

export function ApplyRuleButton({
  rule,
  config,
  entityType,
}: ApplyRuleButtonProps) {
  const type = entityType || "scenes";
  const intl = useIntl();
  const client = useApolloClient();
  const [confirming, setConfirming] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobInfo | null>(null);

  const sceneFilter = ruleToPreviewFilter(rule, config[type]);
  const notReady = sceneFilter === null;
  const disabledRule = rule.enabled === false;
  const running = !!jobId && (!job || !isTerminalStatus(job.status));

  async function handleConfirmedApply() {
    setConfirming(false);
    setJob(null);
    const id = await runRenameTask(client, {
      entity: type,
      entity_filter: sceneFilter,
    });
    setJobId(id);
    pollJob(client, id, setJob);
  }

  function statusText(): string | null {
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
        { id: "librarian.applyRuleButton.applying" },
        { progress: pct },
      );
    }
    return intl.formatMessage(
      { id: "librarian.renameButton.jobStatus.terminal" },
      { status: job.status.toLowerCase() },
    );
  }

  const status = statusText();
  const hint = disabledRule
    ? intl.formatMessage({ id: "librarian.applyRuleButton.disabledHint" })
    : notReady
      ? intl.formatMessage({ id: "librarian.applyRuleButton.notReadyHint" })
      : undefined;

  return (
    <div className="librarian-apply-rule">
      {confirming && (
        <ConfirmModal
          show
          icon={faFolderTree}
          header={intl.formatMessage({
            id: "librarian.applyRuleButton.confirm.header",
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
              { id: "librarian.applyRuleButton.confirm.body" },
              { entityNoun: eligibleEntityNoun(intl, config, false, type) },
            )}
          </p>
        </ConfirmModal>
      )}
      {status && (
        <span className="librarian-token-hint text-muted">{status}</span>
      )}
      <Button
        variant="primary"
        disabled={notReady || disabledRule || running}
        onClick={() => setConfirming(true)}
        title={hint}
      >
        {intl.formatMessage(
          { id: "librarian.applyRuleButton.applyToMatching" },
          { entityNoun: countableNoun(intl, type) },
        )}
      </Button>
    </div>
  );
}
