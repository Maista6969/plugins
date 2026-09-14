import React, { useEffect, useMemo, useState } from "react";
import { useApolloClient, useQuery } from "@apollo/client";
import {
  CLEARABLE_FIELDS,
  fieldsSharedWithOthers,
  buildUnlinkInput,
} from "../core/unlink-fields.js";
import {
  SCENES_FOR_UNLINK,
  updateScene,
  stashBoxLabel,
  StashBoxSummary,
} from "./shared/stash-api.js";
import { ConfirmModal } from "./shared/ConfirmModal.js";
import { DuplicateGroup } from "./DuplicateGroupList.js";

const PluginApi = (window as any).PluginApi;
const { Form, Spinner } = PluginApi.libraries.Bootstrap;
const { faUnlink } = PluginApi.libraries.FontAwesomeSolid;

interface UnlinkSceneDialogProps {
  group: DuplicateGroup;
  sceneId: string;
  label: string;
  stashBoxes: StashBoxSummary[];
  onClose: (changed: boolean) => void;
}

// For a scene matched to the wrong stash-box entry: drop the stash ID so it
// stops being reported as a duplicate, and clear the metadata that came with
// the match. Fields identical to another scene on the same entry are
// pre-selected; see unlink-fields.js for why.
export function UnlinkSceneDialog({
  group,
  sceneId,
  label,
  stashBoxes,
  onClose,
}: UnlinkSceneDialogProps) {
  const client = useApolloClient();
  const ids = useMemo(() => group.items.map((i) => i.id), [group]);
  const { data, loading } = useQuery(SCENES_FOR_UNLINK, {
    variables: { ids },
    fetchPolicy: "network-only",
  });
  const [clear, setClear] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scenes = (data?.findScenes?.scenes ?? []) as any[];
  const target = scenes.find((s) => String(s.id) === sceneId);
  const others = scenes.filter((s) => String(s.id) !== sceneId);

  useEffect(() => {
    if (target && clear === null) {
      setClear(new Set(fieldsSharedWithOthers(target, others)));
    }
  }, [target, others, clear]);

  function toggle(key: string) {
    setClear((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function unlink() {
    if (!target || !clear) return;
    setBusy(true);
    setError(null);
    try {
      await updateScene(
        client,
        buildUnlinkInput(target, group.endpoint, group.stashId, [...clear]),
      );
      onClose(true);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setBusy(false);
    }
  }

  return (
    <ConfirmModal
      show
      icon={faUnlink}
      header="Unlink from stash-box entry"
      cancel={{ text: "Cancel", onClick: () => onClose(false) }}
      accept={{ text: busy ? "Unlinking..." : "Unlink", onClick: unlink }}
    >
      {loading || !target || !clear ? (
        <Spinner animation="border" size="sm" />
      ) : (
        <>
          <p>
            Remove the {stashBoxLabel(group.endpoint, stashBoxes)} link from{" "}
            <span className="text-break">{label}</span>? The other{" "}
            {others.length === 1 ? "scene keeps its" : "scenes keep their"}{" "}
            link.
          </p>
          <p className="mb-1">
            Also clear the fields the match filled in. Pre-selected fields are
            identical to another scene on this entry, so they almost certainly
            came from it.
          </p>
          {CLEARABLE_FIELDS.map((f) => (
            <Form.Check
              key={f.key}
              type="checkbox"
              id={`unlink-clear-${f.key}`}
              label={f.label}
              checked={clear.has(f.key)}
              onChange={() => toggle(f.key)}
              disabled={busy}
            />
          ))}
          {error && <p className="text-danger mt-2 mb-0">{error}</p>}
        </>
      )}
    </ConfirmModal>
  );
}
