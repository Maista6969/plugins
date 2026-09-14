import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  SceneMergeLauncher,
  PerformerMergeLauncher,
  TagMergeLauncher,
} from "./MergeLauncher.js";
import { MergedFilesChooser } from "./MergedFilesChooser.js";
import { UnlinkSceneDialog } from "./UnlinkSceneDialog.js";
import { stashBoxLabel, StashBoxSummary } from "./shared/stash-api.js";
import { secondsToTimestamp } from "./shared/text-utils.js";
import { stripCommonPrefix } from "../core/strip-common-prefix.js";
import { durationSpread } from "../core/group-duplicates.js";

const PluginApi = (window as any).PluginApi;
const { Badge, Button } = PluginApi.libraries.Bootstrap;

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

// Re-encodes of one scene keep its running time to within a few seconds;
// anything wider is most likely two different scenes on one stash-box entry.
const SAME_LENGTH_TOLERANCE_SECONDS = 10;

function LengthBadge({ group }: { group: DuplicateGroup }) {
  const spread = durationSpread(group.items);
  if (spread === null) return null;
  if (spread <= SAME_LENGTH_TOLERANCE_SECONDS) {
    return (
      <Badge
        variant="secondary"
        title="Likely the same scene in different encodes"
      >
        same length
      </Badge>
    );
  }
  return (
    <Badge
      variant="warning"
      title="Likely different scenes matched to the same entry"
    >
      lengths differ by {secondsToTimestamp(spread)}
    </Badge>
  );
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
  const isScene = mergeKind === "scene";

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
                  {isScene && (
                    <div className="mt-1">
                      <LengthBadge group={group} />
                    </div>
                  )}
                </div>
                <div className="text-muted small text-nowrap mx-3">
                  {stashBoxLabel(group.endpoint, stashBoxes)}
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
