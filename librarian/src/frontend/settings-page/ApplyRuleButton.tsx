import React, { useState } from "react";
import { useApolloClient } from "@apollo/client";
import { ruleToPreviewFilter } from "../../core/rule-to-filter.js";
import { runRenameTask } from "../shared/stash-api.js";
import { pollJob, isTerminalStatus, JobInfo } from "../shared/job-poll.js";
import { ConfirmModal } from "../shared/ConfirmModal.js";
import { eligibleSceneNoun } from "../shared/eligible-scenes.js";

const PluginApi = (window as any).PluginApi;
const { Button } = PluginApi.libraries.Bootstrap;
const { faFolderTree } = PluginApi.libraries.FontAwesomeSolid;

interface ApplyRuleButtonProps {
  rule: any;
  config: any;
}

export function ApplyRuleButton({ rule, config }: ApplyRuleButtonProps) {
  const client = useApolloClient();
  const [confirming, setConfirming] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobInfo | null>(null);

  const sceneFilter = ruleToPreviewFilter(rule, config);
  const notReady = sceneFilter === null;
  const disabledRule = rule.enabled === false;
  const running = !!jobId && (!job || !isTerminalStatus(job.status));

  async function handleConfirmedApply() {
    setConfirming(false);
    setJob(null);
    const id = await runRenameTask(client, {
      scene_filter: sceneFilter,
    });
    setJobId(id);
    pollJob(client, id, setJob);
  }

  function statusText(): string | null {
    if (!jobId) {
      return null;
    }
    if (!job) {
      return "Starting...";
    }
    if (!isTerminalStatus(job.status)) {
      const pct =
        job.progress != null ? Math.round(job.progress * 100) + "%" : "...";
      return "Applying... " + pct;
    }
    return "Rename job " + job.status.toLowerCase();
  }

  const status = statusText();
  const hint = disabledRule
    ? "Enable this rule to apply it"
    : notReady
      ? "Fill in at least one condition to enable this rule"
      : undefined;

  return (
    <div className="librarian-apply-rule">
      {confirming && (
        <ConfirmModal
          show
          icon={faFolderTree}
          header="Apply this rule now?"
          cancel={{ text: "Cancel", onClick: () => setConfirming(false) }}
          accept={{
            text: "Apply",
            variant: "danger",
            onClick: handleConfirmedApply,
          }}
        >
          <p>
            Every {eligibleSceneNoun(config)} currently matching this rule will
            be renamed/moved on disk immediately: this is a real run, not a
            preview, and it CANNOT be undone
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
        Apply to all matching scenes
      </Button>
    </div>
  );
}
