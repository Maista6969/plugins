import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  SceneMergeLauncher,
  PerformerMergeLauncher,
  TagMergeLauncher,
} from "./MergeLauncher.js";
import { stashBoxLabel, StashBoxSummary } from "./shared/stash-api.js";
import { stripCommonPrefix } from "../core/strip-common-prefix.js";

const PluginApi = (window as any).PluginApi;
const { Button } = PluginApi.libraries.Bootstrap;

export interface DuplicateGroup {
  stashId: string;
  endpoint: string;
  items: { id: string; label: string }[];
}

export type MergeKind = "scene" | "performer" | "tag";

// Only scene labels are paths; performer and tag labels are names, which have
// no meaningful prefix to share.
export function groupLabels(group: DuplicateGroup, mergeKind?: MergeKind) {
  const labels = group.items.map((i) => i.label);
  return mergeKind === "scene" ? stripCommonPrefix(labels) : labels;
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
  onMerged?: () => void;
}

export function DuplicateGroupList({
  title,
  description,
  entityPath,
  groups,
  stashBoxes,
  mergeKind,
  onMerged,
}: DuplicateGroupListProps) {
  const [merging, setMerging] = useState<DuplicateGroup | null>(null);

  function handleClose(merged: boolean) {
    setMerging(null);
    if (merged) onMerged?.();
  }

  const Launcher = mergeKind ? LAUNCHERS[mergeKind] : null;

  return (
    <div className="doppelganger-section">
      <h4>{title}</h4>
      <p className="text-muted">{description}</p>

      {groups === null && <p className="text-muted">Loading...</p>}
      {groups !== null && groups.length === 0 && (
        <p className="text-muted">No duplicates found.</p>
      )}

      {groups !== null && groups.length > 0 && (
        <ul className="doppelganger-group-list">
          {groups.map((group) => {
            const labels = groupLabels(group, mergeKind);
            return (
              <li
                key={group.stashId + group.endpoint}
                className="doppelganger-group"
              >
                <div className="doppelganger-group-items">
                  {group.items.map((item, i) => (
                    <Link
                      key={item.id}
                      to={`/${entityPath}/${item.id}`}
                      className="doppelganger-group-item"
                      title={item.label}
                    >
                      {labels[i] || `#${item.id}`}
                    </Link>
                  ))}
                </div>
                <div className="doppelganger-group-meta text-muted">
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
              </li>
            );
          })}
        </ul>
      )}

      {Launcher && merging && (
        <Launcher
          key={merging.stashId + merging.endpoint}
          group={merging}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
