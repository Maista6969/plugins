import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  SceneMergeLauncher,
  PerformerMergeLauncher,
  TagMergeLauncher,
} from "./MergeLauncher.js";

const PluginApi = (window as any).PluginApi;
const { Button } = PluginApi.libraries.Bootstrap;

export interface DuplicateGroup {
  stashId: string;
  endpoint: string;
  items: { id: string; label: string }[];
}

export type MergeKind = "scene" | "performer" | "tag";

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
  mergeKind?: MergeKind;
  onMerged?: () => void;
}

export function DuplicateGroupList({
  title,
  description,
  entityPath,
  groups,
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
          {groups.map((group) => (
            <li
              key={group.stashId + group.endpoint}
              className="doppelganger-group"
            >
              <div className="doppelganger-group-items">
                {group.items.map((item, i) => (
                  <React.Fragment key={item.id}>
                    {i > 0 && (
                      <span className="doppelganger-group-separator">=</span>
                    )}
                    <Link to={`/${entityPath}/${item.id}`}>
                      {item.label || `#${item.id}`}
                    </Link>
                  </React.Fragment>
                ))}
              </div>
              <div className="doppelganger-group-meta text-muted">
                {group.endpoint}
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
          ))}
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
