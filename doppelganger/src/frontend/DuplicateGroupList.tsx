import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApolloClient } from "@apollo/client";
import {
  SceneMergeLauncher,
  PerformerMergeLauncher,
  TagMergeLauncher,
} from "./MergeLauncher.js";
import { MergedFilesChooser } from "./MergedFilesChooser.js";
import { UnlinkSceneDialog } from "./UnlinkSceneDialog.js";
import {
  fetchStashBoxDuration,
  stashBoxLabel,
  StashBoxSummary,
} from "./shared/stash-api.js";
import { secondsToTimestamp } from "./shared/text-utils.js";
import { stripCommonPrefix } from "../core/strip-common-prefix.js";

const PluginApi = (window as any).PluginApi;
const { Button } = PluginApi.libraries.Bootstrap;

export interface DuplicateGroup {
  stashId: string;
  endpoint: string;
  items: { id: string; label: string; duration: number | null }[];
}

export type MergeKind = "scene" | "performer" | "tag";

// Only scene labels are paths; performer and tag labels are names, which have
// no meaningful prefix to share.
export function groupLabels(group: DuplicateGroup, mergeKind?: MergeKind) {
  const labels = group.items.map((i) => i.label);
  return mergeKind === "scene" ? stripCommonPrefix(labels) : labels;
}

// Two scenes on one stash-box entry are either the same scene in different
// encodes or different scenes whose fingerprint was matched to the wrong
// entry. The entry's own running time settles it: the scene whose file is
// within a few seconds of it is the real match. Stash-box durations are whole
// seconds and encodes drift a little; seven seconds is the widest genuine gap
// seen in years of StashDB admin work.
const MATCH_TOLERANCE_SECONDS = 7;

function groupKey(group: DuplicateGroup) {
  return group.stashId + "\0" + group.endpoint;
}

// One lookup per group, in sequence so a long list does not hammer the
// stash-box; null means the box had nothing to say.
function useStashBoxDurations(groups: DuplicateGroup[] | null) {
  const client = useApolloClient();
  const [durations, setDurations] = useState<Map<string, number | null>>(
    () => new Map(),
  );

  useEffect(() => {
    if (!groups) return;
    let cancelled = false;
    (async () => {
      for (const group of groups) {
        if (cancelled) return;
        const duration = await fetchStashBoxDuration(
          client,
          group.endpoint,
          group.stashId,
        );
        if (cancelled) return;
        setDurations((prev) => new Map(prev).set(groupKey(group), duration));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, groups]);

  return durations;
}

const LAUNCHERS = {
  scene: SceneMergeLauncher,
  performer: PerformerMergeLauncher,
  tag: TagMergeLauncher,
};

interface DuplicateGroupListProps {
  title: string;
  description: string;
  entityPath: string;
  groups: DuplicateGroup[] | null;
  stashBoxes: StashBoxSummary[];
  mergeKind?: MergeKind;
  trashPath?: string;
  onChanged?: () => void;
}

export function DuplicateGroupList({
  title,
  description,
  entityPath,
  groups,
  stashBoxes,
  mergeKind,
  trashPath,
  onChanged,
}: DuplicateGroupListProps) {
  const isScene = mergeKind === "scene";
  const boxDurations = useStashBoxDurations(isScene ? groups : null);
  const [merging, setMerging] = useState<DuplicateGroup | null>(null);
  const [mergedSceneId, setMergedSceneId] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState<{
    group: DuplicateGroup;
    sceneId: string;
    label: string;
  } | null>(null);

  function handleMergeClose(mergedID?: string) {
    setMerging(null);
    if (!mergedID) return;
    // A merged scene now holds every file; only scenes need the follow-up.
    if (mergeKind === "scene") setMergedSceneId(mergedID);
    else onChanged?.();
  }

  function handleChooserClose() {
    setMergedSceneId(null);
    onChanged?.();
  }

  function handleUnlinkClose(changed: boolean) {
    setUnlinking(null);
    if (changed) onChanged?.();
  }

  const Launcher = mergeKind ? LAUNCHERS[mergeKind] : null;

  return (
    <div className="mb-5">
      <h4>{title}</h4>
      <p className="text-muted">{description}</p>

      {groups === null && <p className="text-muted">Loading...</p>}
      {groups !== null && groups.length === 0 && (
        <p className="text-muted">No duplicates found.</p>
      )}

      {groups !== null &&
        groups.map((group, index) => {
          const labels = groupLabels(group, mergeKind);
          const reference = boxDurations.get(groupKey(group)) ?? null;
          const matches = (duration: number | null) =>
            reference !== null &&
            duration !== null &&
            Math.abs(duration - reference) <= MATCH_TOLERANCE_SECONDS;
          return (
            <React.Fragment key={group.stashId + group.endpoint}>
              {index > 0 && <hr />}
              <div className="d-flex align-items-center py-2">
                {/* Scene labels are paths with the shared part already
                    stripped, so what remains differs from its first segment
                    onwards and truncating at the end keeps the distinguishing
                    part visible. The full label is in the title. */}
                <div className="flex-grow-1 overflow-hidden">
                  {group.items.map((item, i) => (
                    <div key={item.id} className="d-flex align-items-center">
                      <div
                        className="flex-grow-1 text-truncate"
                        title={item.label}
                      >
                        <Link to={`/${entityPath}/${item.id}`}>
                          {labels[i] || `#${item.id}`}
                        </Link>
                      </div>
                      {isScene && item.duration !== null && (
                        <span
                          className={`small text-nowrap ml-3 ${
                            matches(item.duration)
                              ? "text-success"
                              : "text-muted"
                          }`}
                          title={
                            matches(item.duration)
                              ? "Matches the stash-box entry's running time"
                              : undefined
                          }
                        >
                          {secondsToTimestamp(item.duration)}
                        </span>
                      )}
                      {isScene && (
                        <Button
                          variant="link"
                          size="sm"
                          className="py-0"
                          onClick={() =>
                            setUnlinking({
                              group,
                              sceneId: item.id,
                              label: labels[i] || `#${item.id}`,
                            })
                          }
                        >
                          Unlink...
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="text-muted small text-nowrap mx-3 text-right">
                  {stashBoxLabel(group.endpoint, stashBoxes)}
                  {reference !== null && (
                    <div title="The entry's running time on the stash-box">
                      {secondsToTimestamp(reference)}
                    </div>
                  )}
                </div>
                {Launcher && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setMerging(group)}
                  >
                    Merge...
                  </Button>
                )}
              </div>
            </React.Fragment>
          );
        })}

      {Launcher && merging && (
        <Launcher
          key={merging.stashId + merging.endpoint}
          group={merging}
          onClose={handleMergeClose}
        />
      )}

      {mergedSceneId && (
        <MergedFilesChooser
          key={mergedSceneId}
          sceneId={mergedSceneId}
          trashPath={trashPath}
          onClose={handleChooserClose}
        />
      )}

      {unlinking && (
        <UnlinkSceneDialog
          key={unlinking.sceneId}
          group={unlinking.group}
          sceneId={unlinking.sceneId}
          label={unlinking.label}
          stashBoxes={stashBoxes}
          onClose={handleUnlinkClose}
        />
      )}
    </div>
  );
}
