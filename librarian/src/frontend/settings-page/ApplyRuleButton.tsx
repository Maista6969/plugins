import React, { useState } from "react";
import { useIntl } from "react-intl";
import { ruleToPreviewFilter } from "../../core/rule-to-filter.js";
import { useRenameJob } from "../shared/rename-run.js";
import { RunResultStatus } from "../shared/RunResultStatus.js";
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
  const [confirming, setConfirming] = useState(false);
  const { jobId, job, result, running, start } = useRenameJob();

  const sceneFilter = ruleToPreviewFilter(rule, config[type]);
  const notReady = sceneFilter === null;
  const disabledRule = rule.enabled === false;

  function handleConfirmedApply() {
    setConfirming(false);
    start({ entity: type, entity_filter: sceneFilter, rule_id: rule.id });
  }

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
      {jobId && (
        <RunResultStatus
          job={job}
          result={result}
          runningMessageId="librarian.applyRuleButton.applying"
          className="librarian-token-hint text-muted"
          entityType={type}
        />
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
