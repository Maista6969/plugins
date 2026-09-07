import React, { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApolloClient } from "@apollo/client";
import { FormattedDate, useIntl } from "react-intl";
import {
  defaultKeeperId,
  planCopyDeletion,
} from "../core/group-identical-copies.js";
import { stripCommonPrefix } from "../core/strip-common-prefix.js";
import { executeCopyDeletion } from "./shared/stash-api.js";
import { ConfirmModal } from "./shared/ConfirmModal.js";
import { FileSize } from "./shared/FileSize.js";

const PluginApi = (window as any).PluginApi;
const { Button, Form, ProgressBar } = PluginApi.libraries.Bootstrap;
const { faTrashAlt } = PluginApi.libraries.FontAwesomeSolid;

export interface CopyFile {
  id: string;
  primary: boolean;
  path: string;
  size: number;
  modTime: string;
}

export interface IdenticalCopyGroup {
  key: string;
  sceneId: string;
  title: string;
  oshash: string;
  files: CopyFile[];
}

interface IdenticalCopiesListProps {
  groups: IdenticalCopyGroup[] | null;
  // undefined: this Stash predates the trash feature; "": feature present but off.
  trashPath: string | undefined;
  onDeleted: () => void;
}

interface Progress {
  done: number;
  total: number;
  bytes: number;
}

function TrashNotice({ trashPath }: { trashPath: string | undefined }) {
  if (trashPath) {
    return (
      <p>
        Files will be moved to the trash folder <code>{trashPath}</code>.
      </p>
    );
  }
  return (
    <p>
      Files will be permanently deleted from disk.
      {trashPath === "" && (
        <>
          {" "}
          A trash folder can be set under Settings &gt; System &gt; Trash path.
        </>
      )}
    </p>
  );
}

export function IdenticalCopiesList({
  groups,
  trashPath,
  onDeleted,
}: IdenticalCopiesListProps) {
  const client = useApolloClient();
  const intl = useIntl();
  // Only overrides live here; anything unset falls back to the primary file,
  // so a refresh that changes primaries never points at a stale choice.
  const [keepers, setKeepers] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<IdenticalCopyGroup[] | null>(
    null,
  );
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRequested = useRef(false);

  const plans = useMemo(() => {
    const map = new Map<string, ReturnType<typeof planCopyDeletion>>();
    for (const group of groups ?? []) {
      const keeper = keepers[group.key] ?? defaultKeeperId(group);
      map.set(group.key, planCopyDeletion(group, keeper));
    }
    return map;
  }, [groups, keepers]);

  const keeperFor = (group: IdenticalCopyGroup) =>
    keepers[group.key] ?? defaultKeeperId(group);

  const totals = useMemo(() => {
    let files = 0;
    let bytes = 0;
    for (const plan of plans.values()) {
      files += plan.deleteFileIds.length;
      bytes += plan.bytes;
    }
    return { files, bytes };
  }, [plans]);

  async function runDeletion(targets: IdenticalCopyGroup[]) {
    setConfirming(null);
    setError(null);
    abortRequested.current = false;
    const total = targets.reduce(
      (n, g) => n + plans.get(g.key)!.deleteFileIds.length,
      0,
    );
    setProgress({ done: 0, total, bytes: 0 });

    let done = 0;
    let bytes = 0;
    try {
      for (const group of targets) {
        if (abortRequested.current) break;
        const plan = plans.get(group.key)!;
        await executeCopyDeletion(client, plan);
        done += plan.deleteFileIds.length;
        bytes += plan.bytes;
        setProgress({ done, total, bytes });
      }
    } catch (e: any) {
      setError(
        `Stopped after ${done} of ${total} files: ${e?.message ?? String(e)}`,
      );
    } finally {
      setProgress(null);
      // Anything already deleted is gone regardless of how the run ended, so
      // the list has to be rebuilt either way.
      if (done > 0) onDeleted();
    }
  }

  const busy = progress !== null;

  return (
    <div className="doppelganger-section">
      <div className="doppelganger-section-header">
        <h4>
          Scenes with identical copies
          {groups && groups.length > 0 && (
            <span className="doppelganger-count">{groups.length}</span>
          )}
        </h4>
        {groups && groups.length > 0 && (
          <Button
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={() => setConfirming(groups)}
          >
            Delete all extra copies ({totals.files} files,{" "}
            <FileSize size={totals.bytes} />)
          </Button>
        )}
      </div>
      <p className="text-muted">
        A scan attaches a file to an existing scene when it is byte-for-byte the
        same as one already there, so these scenes hide duplicate files behind a
        single entry. Pick the copy to keep; the rest are deleted through
        Stash&apos;s own file deletion.
      </p>

      {groups === null && <p className="text-muted">Loading...</p>}
      {groups !== null && groups.length === 0 && (
        <p className="text-muted">No identical copies found.</p>
      )}

      {error && <p className="text-danger">{error}</p>}

      {progress && (
        <div className="doppelganger-progress">
          <ProgressBar
            now={progress.total ? (progress.done / progress.total) * 100 : 0}
            label={`${progress.done} / ${progress.total}`}
          />
          <span className="text-muted">
            <FileSize size={progress.bytes} /> freed
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={abortRequested.current}
            onClick={() => {
              abortRequested.current = true;
            }}
          >
            Stop after this scene
          </Button>
        </div>
      )}

      {groups !== null && groups.length > 0 && (
        <ul className="doppelganger-group-list">
          {groups.map((group) => {
            const labels = stripCommonPrefix(group.files.map((f) => f.path));
            const keeper = keeperFor(group);
            const plan = plans.get(group.key)!;
            return (
              <li key={group.key} className="doppelganger-copies-group">
                <div className="doppelganger-copies-header">
                  <Link to={`/scenes/${group.sceneId}`}>
                    {group.title || `Scene #${group.sceneId}`}
                  </Link>
                  <span className="text-muted">
                    {group.files.length} copies of{" "}
                    <FileSize size={group.files[0].size} />
                  </span>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy}
                    onClick={() => setConfirming([group])}
                  >
                    Delete {plan.deleteFileIds.length}{" "}
                    {plan.deleteFileIds.length === 1 ? "copy" : "copies"}
                  </Button>
                </div>
                <table className="doppelganger-copies-table">
                  <tbody>
                    {group.files.map((file, i) => (
                      <tr
                        key={file.id}
                        className={file.id === keeper ? "is-keeper" : ""}
                        onClick={() =>
                          setKeepers((k) => ({ ...k, [group.key]: file.id }))
                        }
                      >
                        <td className="doppelganger-copies-keep">
                          <Form.Check
                            type="radio"
                            name={`keeper-${group.key}`}
                            checked={file.id === keeper}
                            onChange={() =>
                              setKeepers((k) => ({
                                ...k,
                                [group.key]: file.id,
                              }))
                            }
                            label="Keep"
                            disabled={busy}
                          />
                        </td>
                        <td
                          className="doppelganger-copies-path"
                          title={file.path}
                        >
                          {labels[i]}
                          {file.primary && (
                            <span className="doppelganger-badge">primary</span>
                          )}
                        </td>
                        {/* The date alone is what gets compared; the
                            tooltip carries the same rendering Stash's file
                            tab uses for modification time. */}
                        <td
                          className="doppelganger-copies-time text-muted"
                          title={intl.formatTime(file.modTime, {
                            dateStyle: "medium",
                            timeStyle: "medium",
                          })}
                        >
                          <FormattedDate value={file.modTime} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </li>
            );
          })}
        </ul>
      )}

      {confirming && (
        <ConfirmModal
          show
          icon={faTrashAlt}
          header="Delete identical copies"
          cancel={{ text: "Cancel", onClick: () => setConfirming(null) }}
          accept={{
            text: "Delete",
            variant: "danger",
            onClick: () => runDeletion(confirming),
          }}
        >
          <ConfirmBody
            groups={confirming}
            plans={plans}
            trashPath={trashPath}
          />
        </ConfirmModal>
      )}
    </div>
  );
}

function ConfirmBody({
  groups,
  plans,
  trashPath,
}: {
  groups: IdenticalCopyGroup[];
  plans: Map<string, ReturnType<typeof planCopyDeletion>>;
  trashPath: string | undefined;
}) {
  const count = groups.reduce(
    (n, g) => n + plans.get(g.key)!.deleteFileIds.length,
    0,
  );
  const bytes = groups.reduce((n, g) => n + plans.get(g.key)!.bytes, 0);
  const paths = groups.flatMap((g) => {
    const plan = plans.get(g.key)!;
    return g.files
      .filter((f) => plan.deleteFileIds.includes(f.id))
      .map((f) => f.path);
  });

  return (
    <>
      <p>
        Delete {count} {count === 1 ? "file" : "files"} (
        <FileSize size={bytes} />) across {groups.length}{" "}
        {groups.length === 1 ? "scene" : "scenes"}? Each scene keeps the copy
        you selected.
      </p>
      <TrashNotice trashPath={trashPath} />
      {paths.length <= 20 ? (
        <ul className="doppelganger-confirm-paths">
          {paths.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">
          The full list is too long to show here; each scene&apos;s table above
          marks what stays.
        </p>
      )}
    </>
  );
}
