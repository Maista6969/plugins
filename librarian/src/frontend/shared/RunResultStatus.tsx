import React, { useState } from "react";
import { useIntl, IntlShape } from "react-intl";
import { isTerminalStatus, JobInfo } from "./job-poll.js";
import { RunResult, RunFailure } from "./stash-api.js";
import { describeMissingData } from "./describe-missing.js";
import { useStashBoxes } from "./StashBoxesContext.js";
import { entityUI } from "./entity-ui.js";

const PluginApi = (window as any).PluginApi;
const { Modal, Button, Table } = PluginApi.libraries.Bootstrap;

function basename(path: string): string {
  return path.replace(/^.*[\\/]/, "");
}

function entityLink(id: string, name: string, entityType?: string) {
  return (
    <a
      href={entityUI(entityType).route + id}
      target="_blank"
      rel="noopener noreferrer"
    >
      {name}
    </a>
  );
}

export function describeFailure(
  intl: IntlShape,
  failure: RunFailure,
  stashBoxes: any[],
  entityType?: string,
): React.ReactNode {
  const collision = failure.collision;
  if (collision && collision.ownerId) {
    return intl.formatMessage(
      { id: "librarian.runResult.collisionWithOwner" },
      {
        path: collision.path,
        owner: entityLink(
          collision.ownerId,
          collision.ownerTitle || basename(collision.path),
          entityType,
        ),
      },
    );
  }
  if (collision) {
    return intl.formatMessage(
      { id: "librarian.runResult.collision" },
      { path: collision.path },
    );
  }
  if (failure.missingData && failure.missingData.length > 0) {
    return intl.formatMessage(
      { id: "librarian.planResultTable.errorPrefix" },
      { message: describeMissingData(failure.missingData, stashBoxes) },
    );
  }
  // raised by Stash or the runtime, so only the frame can be translated
  return intl.formatMessage(
    { id: "librarian.planResultTable.errorPrefix" },
    { message: failure.message },
  );
}

export function FailuresTable({
  failures,
  entityType,
  showWhen,
}: {
  failures: RunFailure[];
  entityType?: string;
  showWhen?: boolean;
}) {
  const intl = useIntl();
  const { stashBoxes } = useStashBoxes();
  return (
    <Table striped bordered size="sm">
      <tbody>
        {failures.map((f, i) => (
          <tr key={(f.id || "") + ":" + i}>
            <td className="text-nowrap">
              {f.id != null
                ? entityLink(f.id, f.title || f.id, entityType)
                : "-"}
            </td>
            <td className="librarian-message-cell">
              {describeFailure(intl, f, stashBoxes, entityType)}
            </td>
            {showWhen && (
              <td className="text-nowrap text-muted">
                {f.at
                  ? intl.formatDate(f.at, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : ""}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

interface FailuresModalProps {
  header: React.ReactNode;
  failures: RunFailure[];
  entityType?: string;
  showWhen?: boolean;
  note?: React.ReactNode;
  onClear?: () => void;
  clearing?: boolean;
  onHide: () => void;
}

export function FailuresModal({
  header,
  failures,
  entityType,
  showWhen,
  note,
  onClear,
  clearing,
  onHide,
}: FailuresModalProps) {
  const intl = useIntl();
  return (
    <Modal className="ModalComponent" show onHide={onHide} size="lg">
      <Modal.Header>
        <span>{header}</span>
      </Modal.Header>
      <Modal.Body>
        <FailuresTable
          failures={failures}
          entityType={entityType}
          showWhen={showWhen}
        />
        {note && <p className="text-muted">{note}</p>}
      </Modal.Body>
      <Modal.Footer className="ModalFooter">
        <div />
        <div>
          {onClear && (
            <Button
              variant="secondary"
              disabled={clearing}
              onClick={onClear}
              className="ml-2"
            >
              {intl.formatMessage({ id: "actions.clear" })}
            </Button>
          )}
          <Button variant="secondary" onClick={onHide} className="ml-2">
            {intl.formatMessage({ id: "actions.close" })}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}

interface RunResultStatusProps {
  job: JobInfo | null;
  result: RunResult | null;
  runningMessageId: string;
  className: string;
  entityType?: string;
}

// What a rename job came to: progress while it runs, then how many were
// renamed and which could not be, since Stash keeps a task's own output to
// its log
export function RunResultStatus({
  job,
  result,
  runningMessageId,
  className,
  entityType,
}: RunResultStatusProps) {
  const intl = useIntl();
  const [showFailures, setShowFailures] = useState(false);

  if (!job) {
    return (
      <span className={className}>
        {intl.formatMessage({ id: "librarian.common.starting" })}
      </span>
    );
  }
  if (!isTerminalStatus(job.status)) {
    const pct =
      job.progress != null ? Math.round(job.progress * 100) + "%" : "...";
    return (
      <span className={className}>
        {intl.formatMessage({ id: runningMessageId }, { progress: pct })}
      </span>
    );
  }
  if (!result) {
    return (
      <span className={className}>
        {intl.formatMessage(
          { id: "librarian.renameButton.jobStatus.terminal" },
          { status: job.status.toLowerCase() },
        )}
      </span>
    );
  }
  return (
    <span className={className}>
      {intl.formatMessage(
        { id: "librarian.runResult.finished" },
        { changed: result.changed, failed: result.failureCount },
      )}
      {result.failureCount > 0 && (
        <>
          {" "}
          <Button
            variant="link"
            size="sm"
            className="p-0 align-baseline"
            onClick={() => setShowFailures(true)}
          >
            {intl.formatMessage({ id: "details" })}
          </Button>
        </>
      )}
      {showFailures && (
        <FailuresModal
          header={intl.formatMessage(
            { id: "librarian.runResult.failuresHeader" },
            { count: result.failureCount },
          )}
          failures={result.failures}
          entityType={entityType || result.entity}
          note={
            result.failureCount > result.failures.length
              ? intl.formatMessage(
                  { id: "librarian.runResult.moreInLog" },
                  { count: result.failureCount - result.failures.length },
                )
              : null
          }
          onHide={() => setShowFailures(false)}
        />
      )}
    </span>
  );
}
