import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApolloClient } from "@apollo/client";
import { FormattedDate, FormattedNumber, useIntl } from "react-intl";
import {
  planFileDeletion,
  selectFilesToDelete,
} from "../core/multi-file-scenes.js";
import { executeCopyDeletion } from "./shared/stash-api.js";
import { ConfirmModal } from "./shared/ConfirmModal.js";
import { FileSize } from "./shared/FileSize.js";
import { secondsToTimestamp } from "./shared/text-utils.js";
import type { DoppelgangerConfig } from "./ConfigPanel.js";

const PluginApi = (window as any).PluginApi;
const { Badge, Button, Col, Dropdown, Form, ProgressBar, Row, Table } =
  PluginApi.libraries.Bootstrap;
const { faTrashAlt } = PluginApi.libraries.FontAwesomeSolid;

export interface SceneFile {
  id: string;
  primary: boolean;
  path: string;
  size: number;
  modTime: string;
  width: number;
  height: number;
  bitRate: number;
  codec: string;
  duration: number;
  oshash: string | null;
  identical: boolean;
}

export interface MultiFileScene {
  sceneId: string;
  title: string;
  files: SceneFile[];
}

type Plan = ReturnType<typeof planFileDeletion>;

interface MultiFileScenesListProps {
  groups: MultiFileScene[] | null;
  // undefined: this Stash predates the trash feature; "": feature present but off.
  trashPath: string | undefined;
  config: DoppelgangerConfig;
  onConfigChange: (patch: Partial<DoppelgangerConfig>) => void;
  onDeleted: () => void;
}

interface Progress {
  done: number;
  total: number;
  bytes: number;
}

// Stash's own labels for the options it has, so the menu reads exactly like
// its duplicate checker; bit rate is the one rule Stash lacks.
const OPTION_LABELS: [string, string][] = [
  ["none", "dupe_check.select_none"],
  ["largest_resolution", "dupe_check.select_all_but_largest_resolution"],
  ["largest_file", "dupe_check.select_all_but_largest_file"],
  ["highest_bitrate", ""],
  ["preferred_codec", "dupe_check.select_all_but_preferred_codec"],
  ["oldest", "dupe_check.select_oldest"],
  ["youngest", "dupe_check.select_youngest"],
];

export function MultiFileScenesList({
  groups,
  trashPath,
  config,
  onConfigChange,
  onDeleted,
}: MultiFileScenesListProps) {
  const client = useApolloClient();
  const intl = useIntl();
  // Only boxes ticked or unticked by hand live here; everything else follows
  // the selection rule, so changing the rule or refreshing starts clean.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState<MultiFileScene[] | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRequested = useRef(false);

  useEffect(() => setOverrides({}), [groups]);

  // Like Stash, only codecs actually present are offered, and a stored choice
  // that no longer appears falls back to the first.
  const codecOptions = useMemo(() => {
    const codecs = (groups ?? [])
      .flatMap((g) => g.files.map((f) => f.codec))
      .filter(Boolean);
    return Array.from(new Set(codecs)).sort();
  }, [groups]);
  const preferredCodec = codecOptions.includes(config.preferredCodec)
    ? config.preferredCodec
    : (codecOptions[0] ?? "");

  const plans = useMemo(() => {
    const map = new Map<string, Plan>();
    for (const group of groups ?? []) {
      const auto = selectFilesToDelete(group, config.selectOption, {
        preferredCodec,
        onlyMatchingCodecs: config.onlySelectMatchingCodecs,
      });
      const ids = group.files
        .filter((f) => overrides[f.id] ?? auto.includes(f.id))
        .map((f) => f.id);
      map.set(group.sceneId, planFileDeletion(group, ids));
    }
    return map;
  }, [groups, overrides, config, preferredCodec]);

  const selected = useMemo(
    () =>
      (groups ?? []).filter((g) => plans.get(g.sceneId)!.deleteFileIds.length),
    [groups, plans],
  );
  const totals = useMemo(() => {
    let files = 0;
    let bytes = 0;
    for (const plan of plans.values()) {
      files += plan.deleteFileIds.length;
      bytes += plan.bytes;
    }
    return { files, bytes };
  }, [plans]);

  function setRule(patch: Partial<DoppelgangerConfig>) {
    setOverrides({});
    onConfigChange(patch);
  }

  async function runDeletion(targets: MultiFileScene[]) {
    setConfirming(null);
    setError(null);
    abortRequested.current = false;
    const total = targets.reduce(
      (n, g) => n + plans.get(g.sceneId)!.deleteFileIds.length,
      0,
    );
    setProgress({ done: 0, total, bytes: 0 });

    let done = 0;
    let bytes = 0;
    try {
      for (const group of targets) {
        if (abortRequested.current) break;
        const plan = plans.get(group.sceneId)!;
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

  function optionLabel(id: string) {
    return id
      ? intl.formatMessage({ id })
      : "Select every file in each duplicated group, except the file with highest bit rate";
  }

  return (
    // Stash scopes its duplicate checker's table styling to this id.
    <div className="mb-5" id="scene-duplicate-checker">
      <h4>
        Scenes with multiple files
        {groups && groups.length > 0 && (
          <Badge className="left-spacing" pill variant="secondary">
            {intl.formatNumber(groups.length)}
          </Badge>
        )}
      </h4>
      <p className="text-muted">
        A scan folds a byte-identical copy of a file into the scene that already
        has it, and a merge moves every file onto the merged scene, so these
        scenes hide extra files behind a single entry. Ticked files are deleted
        through Stash&apos;s own file deletion; each scene always keeps at least
        one.
      </p>

      {groups === null && <p className="text-muted">Loading...</p>}
      {groups !== null && groups.length === 0 && (
        <p className="text-muted">No scenes with multiple files found.</p>
      )}

      {groups !== null && groups.length > 0 && (
        <Form>
          {codecOptions.length > 0 && (
            <Form.Group>
              <Row noGutters>
                <Form.Label>
                  {intl.formatMessage({
                    id: "dupe_check.preferred_codec_label",
                  })}
                </Form.Label>
                <Col xs="auto">
                  <Form.Control
                    as="select"
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setRule({ preferredCodec: e.currentTarget.value })
                    }
                    value={preferredCodec}
                    className="input-control ml-4"
                    disabled={busy}
                  >
                    {codecOptions.map((codec) => (
                      <option key={codec} value={codec}>
                        {codec}
                      </option>
                    ))}
                  </Form.Control>
                </Col>
              </Row>
            </Form.Group>
          )}
          <Form.Group>
            <Row noGutters>
              <Col xs="12">
                <Dropdown>
                  <Dropdown.Toggle variant="secondary" disabled={busy}>
                    {intl.formatMessage({ id: "dupe_check.select_options" })}
                  </Dropdown.Toggle>
                  <Dropdown.Menu className="bg-secondary text-white">
                    {OPTION_LABELS.filter(
                      ([option]) =>
                        option !== "preferred_codec" || codecOptions.length > 0,
                    ).map(([option, id]) => (
                      <Dropdown.Item
                        key={option}
                        active={config.selectOption === option}
                        onClick={() => setRule({ selectOption: option })}
                      >
                        {optionLabel(id)}
                      </Dropdown.Item>
                    ))}
                  </Dropdown.Menu>
                </Dropdown>
              </Col>
            </Row>
            <Row noGutters>
              <Form.Check
                type="checkbox"
                id="doppelganger-only-matching-codecs"
                label={intl.formatMessage({
                  id: "dupe_check.only_select_matching_codecs",
                })}
                checked={config.onlySelectMatchingCodecs}
                disabled={busy}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setRule({ onlySelectMatchingCodecs: e.currentTarget.checked })
                }
              />
            </Row>
          </Form.Group>
        </Form>
      )}

      {error && <p className="text-danger">{error}</p>}

      {progress && (
        <div className="d-flex align-items-center mb-3">
          <ProgressBar
            className="flex-grow-1 mr-3"
            now={progress.total ? (progress.done / progress.total) * 100 : 0}
            label={`${progress.done} / ${progress.total}`}
          />
          <span className="text-muted text-nowrap mr-3">
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
        <>
          <div className="d-flex mt-2 mb-2">
            <h6 className="mr-auto align-self-center">
              {totals.files} {totals.files === 1 ? "file" : "files"} selected (
              <FileSize size={totals.bytes} />)
            </h6>
            {totals.files > 0 && (
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => setConfirming(selected)}
              >
                Delete selected files
              </Button>
            )}
          </div>

          <Table responsive striped>
            <thead>
              <tr>
                <th> </th>
                <th>{intl.formatMessage({ id: "details" })}</th>
                <th>{intl.formatMessage({ id: "duration" })}</th>
                <th>{intl.formatMessage({ id: "filesize" })}</th>
                <th>{intl.formatMessage({ id: "resolution" })}</th>
                <th>{intl.formatMessage({ id: "bitrate" })}</th>
                <th>{intl.formatMessage({ id: "media_info.video_codec" })}</th>
                <th>{intl.formatMessage({ id: "file_mod_time" })}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group, groupIndex) => {
                const plan = plans.get(group.sceneId)!;
                const kept = group.files.length - plan.deleteFileIds.length;
                return (
                  <React.Fragment key={group.sceneId}>
                    {groupIndex !== 0 && <tr className="separator" />}
                    <tr className="duplicate-group">
                      <td colSpan={8}>
                        <div className="d-flex align-items-center">
                          <Link
                            className="flex-grow-1 text-truncate"
                            to={`/scenes/${group.sceneId}`}
                          >
                            {group.title || `Scene #${group.sceneId}`}
                          </Link>
                          {plan.deleteFileIds.length > 0 && (
                            <Button
                              variant="danger"
                              size="sm"
                              className="ml-3"
                              disabled={busy}
                              onClick={() => setConfirming([group])}
                            >
                              {intl.formatMessage({ id: "actions.delete" })}{" "}
                              {plan.deleteFileIds.length}{" "}
                              {plan.deleteFileIds.length === 1
                                ? "file"
                                : "files"}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {group.files.map((file) => {
                      const checked = plan.deleteFileIds.includes(file.id);
                      return (
                        <tr key={file.id}>
                          <td>
                            <Form.Check
                              id={`doppelganger-delete-${file.id}`}
                              checked={checked}
                              // The last file left in a scene cannot be ticked.
                              disabled={busy || (!checked && kept === 1)}
                              onChange={(
                                e: React.ChangeEvent<HTMLInputElement>,
                              ) => {
                                const value = e.currentTarget.checked;
                                setOverrides((o) => ({
                                  ...o,
                                  [file.id]: value,
                                }));
                              }}
                            />
                          </td>
                          <td className="text-left">
                            {/* Struck through in red when ticked, as Stash's
                                duplicate checker marks scenes it will delete. */}
                            <p
                              className="scene-path mb-0"
                              style={{
                                fontWeight: checked ? "bold" : "inherit",
                                textDecoration: checked
                                  ? "line-through 3px"
                                  : "inherit",
                                textDecorationColor: checked
                                  ? "red"
                                  : "inherit",
                              }}
                            >
                              {file.path}
                            </p>
                            {file.primary && (
                              <Badge variant="secondary" className="mr-1">
                                {intl.formatMessage({ id: "primary_file" })}
                              </Badge>
                            )}
                            {file.identical && (
                              <Badge
                                variant="info"
                                title="Byte-identical to another file in this scene"
                              >
                                identical
                              </Badge>
                            )}
                          </td>
                          <td>{secondsToTimestamp(file.duration)}</td>
                          <td>
                            <FileSize size={file.size} />
                          </td>
                          <td>{`${file.width}x${file.height}`}</td>
                          <td>
                            <FormattedNumber
                              value={file.bitRate / 1000000}
                              maximumFractionDigits={2}
                            />
                            &nbsp;mbps
                          </td>
                          <td>{file.codec}</td>
                          <td
                            className="text-nowrap"
                            title={intl.formatTime(file.modTime, {
                              dateStyle: "medium",
                              timeStyle: "medium",
                            })}
                          >
                            <FormattedDate value={file.modTime} />
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </Table>
        </>
      )}

      {confirming && (
        <ConfirmModal
          show
          icon={faTrashAlt}
          header="Delete files"
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

// Mirrors the body of Stash's DeleteFilesDialog: a summary line, then a
// danger alert that names the first few paths and counts the rest.
function ConfirmBody({
  groups,
  plans,
  trashPath,
}: {
  groups: MultiFileScene[];
  plans: Map<string, Plan>;
  trashPath: string | undefined;
}) {
  const count = groups.reduce(
    (n, g) => n + plans.get(g.sceneId)!.deleteFileIds.length,
    0,
  );
  const bytes = groups.reduce((n, g) => n + plans.get(g.sceneId)!.bytes, 0);
  const paths = groups.flatMap((g) => {
    const plan = plans.get(g.sceneId)!;
    return g.files
      .filter((f) => plan.deleteFileIds.includes(f.id))
      .map((f) => f.path);
  });
  const files = count === 1 ? "file" : "files";

  return (
    <>
      <p>
        Delete {count} {files} (<FileSize size={bytes} />) across{" "}
        {groups.length} {groups.length === 1 ? "scene" : "scenes"}? Each scene
        keeps the files left unticked.
      </p>
      <div className="delete-dialog alert alert-danger text-break">
        <p className="font-weight-bold">
          {trashPath
            ? `The following ${files} will be moved to trash (${trashPath}):`
            : `The following ${files} will be permanently deleted:`}
        </p>
        <ul>
          {paths.slice(0, 5).map((p) => (
            <li key={p}>{p}</li>
          ))}
          {paths.length > 5 && <>...and {paths.length - 5} more</>}
        </ul>
        {trashPath === "" && (
          <p className="mb-0">
            A trash folder can be set under Settings &gt; System &gt; Trash
            path.
          </p>
        )}
      </div>
    </>
  );
}
