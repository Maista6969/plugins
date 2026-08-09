import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmModal } from "./shared/ConfirmModal.js";

const PluginApi = (window as any).PluginApi;
const { Button } = PluginApi.libraries.Bootstrap;
const { faCodeMerge } = PluginApi.libraries.FontAwesomeSolid;

export interface DuplicateGroup {
  stashId: string;
  endpoint: string;
  items: { id: string; label: string }[];
}

interface DuplicateGroupListProps {
  title: string;
  description: string;
  entityPath: string;
  groups: DuplicateGroup[] | null;
  onMerge?: (sourceIds: string[], destinationId: string) => Promise<void>;
}

export function DuplicateGroupList({
  title,
  description,
  entityPath,
  groups,
  onMerge,
}: DuplicateGroupListProps) {
  const [merging, setMerging] = useState<DuplicateGroup | null>(null);
  const [pending, setPending] = useState(false);

  async function handleConfirmedMerge() {
    if (!merging || !onMerge) return;
    setPending(true);
    try {
      const [destination, ...rest] = merging.items;
      await onMerge(
        rest.map((i) => i.id),
        destination.id,
      );
      setMerging(null);
    } finally {
      setPending(false);
    }
  }

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
              {onMerge && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setMerging(group)}
                >
                  Merge
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {merging && (
        <ConfirmModal
          show
          icon={faCodeMerge}
          header="Merge duplicates?"
          cancel={{ text: "Cancel", onClick: () => setMerging(null) }}
          accept={{
            text: pending ? "Merging..." : "Merge",
            variant: "danger",
            onClick: handleConfirmedMerge,
          }}
        >
          <p>
            {merging.items
              .slice(1)
              .map((i) => i.label || `#${i.id}`)
              .join(", ")}{" "}
            will be merged into{" "}
            {merging.items[0].label || `#${merging.items[0].id}`} and no longer
            exist as separate entries. This cannot be undone by this plugin.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}
