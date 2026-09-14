import React, { useEffect, useMemo, useState } from "react";
import { useApolloClient, useQuery } from "@apollo/client";
import { planCopyDeletion } from "../core/group-identical-copies.js";
import { stripCommonPrefix } from "../core/strip-common-prefix.js";
import { SCENE_FILES, executeCopyDeletion } from "./shared/stash-api.js";
import { ConfirmModal } from "./shared/ConfirmModal.js";
import { FileSize } from "./shared/FileSize.js";
import { secondsToTimestamp } from "./shared/text-utils.js";

const PluginApi = (window as any).PluginApi;
const { Badge, Form } = PluginApi.libraries.Bootstrap;
const { faTrashAlt } = PluginApi.libraries.FontAwesomeSolid;

interface MergedFilesChooserProps {
  sceneId: string;
  trashPath: string | undefined;
  onClose: () => void;
}

// Stash's merge moves every source file onto the destination, which is
// right for alternate encodes kept on purpose but not for the duplicate a
// re-scrape produced. Straight after a merge the user has just said these
// are the same scene, so this is the one place a file chooser is warranted.
export function MergedFilesChooser({
  sceneId,
  trashPath,
  onClose,
}: MergedFilesChooserProps) {
  const client = useApolloClient();
  const { data, loading } = useQuery(SCENE_FILES, {
    variables: { id: sceneId },
    fetchPolicy: "network-only",
  });
  const [keeper, setKeeper] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stash lists a scene's files primary first.
  const files = useMemo(
    () =>
      ((data?.findScene?.files ?? []) as any[]).map((f, i) => ({
        id: String(f.id),
        primary: i === 0,
        path: f.path as string,
        size: Number(f.size) || 0,
        width: f.width as number,
        height: f.height as number,
        duration: f.duration as number,
        codec: f.video_codec as string,
      })),
    [data],
  );

  useEffect(() => {
    if (!loading && files.length < 2) onClose();
  }, [loading, files, onClose]);

  if (loading || files.length < 2) return null;

  const labels = stripCommonPrefix(files.map((f) => f.path));
  const chosen = keeper ?? files[0].id;
  const plan = planCopyDeletion({ sceneId, files }, chosen);
  const count = plan.deleteFileIds.length;

  async function remove() {
    setError(null);
    try {
      await executeCopyDeletion(client, plan);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  return (
    <ConfirmModal
      show
      icon={faTrashAlt}
      header="Merged scene has several files"
      cancel={{ text: "Keep all files", onClick: onClose }}
      accept={{
        text: `Delete ${count} ${count === 1 ? "file" : "files"}`,
        variant: "danger",
        onClick: remove,
      }}
    >
      <p>
        The merge attached every file to the scene. Pick the one to keep; the
        others are deleted through Stash&apos;s own file deletion
        {trashPath ? (
          <>
            , which moves them to the trash folder <code>{trashPath}</code>.
          </>
        ) : (
          <>, which removes them from disk permanently.</>
        )}
      </p>
      <ul className="list-unstyled mb-0">
        {files.map((file, i) => (
          <li key={file.id} className="mb-2">
            <Form.Check
              type="radio"
              id={`merged-keeper-${file.id}`}
              name="merged-keeper"
              checked={file.id === chosen}
              onChange={() => setKeeper(file.id)}
              label={
                <>
                  <span className="text-break">{labels[i]}</span>
                  {file.primary && (
                    <Badge variant="secondary" className="ml-2">
                      primary
                    </Badge>
                  )}
                  <div className="text-muted small">
                    {file.width} x {file.height} &middot; {file.codec} &middot;{" "}
                    {secondsToTimestamp(file.duration)} &middot;{" "}
                    <FileSize size={file.size} />
                  </div>
                </>
              }
            />
          </li>
        ))}
      </ul>
      {error && <p className="text-danger mb-0">{error}</p>}
    </ConfirmModal>
  );
}
