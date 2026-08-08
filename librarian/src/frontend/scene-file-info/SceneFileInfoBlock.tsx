import React, { useEffect, useState } from "react";
import { useApolloClient, gql } from "@apollo/client";
import { Link } from "react-router-dom";
import { planScene } from "../../core/plan-scene.js";
import { getConfiguration, runRenameTask } from "../shared/stash-api.js";
import { pollJob, isTerminalStatus } from "../shared/job-poll.js";
import { StatusBadge } from "../shared/StatusBadge.js";
import { OrganizeButton } from "../shared/OrganizeButton.js";
import { describeMissingData } from "../shared/describe-missing.js";
import { useStashBoxes } from "../shared/StashBoxesContext.js";
import { matchedRuleLabel, skippedText } from "../shared/PlanResultTable.js";
import { SCENE_FIELDS, STUDIO_FIELDS } from "../shared/scene-query-fields.js";
import { SETTINGS_ROUTE } from "../shared/SettingsLink.js";

const PluginApi = (window as any).PluginApi;

const FIND_SCENE_QUERY = gql(`
  query LibrarianSceneFileInfoFindScene($id: ID!) {
    findScene(id: $id) { ${SCENE_FIELDS} }
  }
`);

// We need the studio names and a deeper studio hierarchy
const ENRICH_STUDIO_QUERY = gql(`
  query LibrarianSceneFileInfoEnrichStudio($id: ID!) {
    findStudio(id: $id) { ${STUDIO_FIELDS} }
  }
`);

interface SceneFileInfoBlockProps {
  scene: any;
}

export function SceneFileInfoBlock({
  scene: sceneProp,
}: SceneFileInfoBlockProps) {
  const client = useApolloClient();
  const [config, setConfig] = useState<any | null>(null);
  const { stashBoxes } = useStashBoxes();
  const [override, setOverride] = useState<any | null>(null);
  const [enrichedStudio, setEnrichedStudio] = useState<any | null>(null);
  const [pending, setPending] = useState(false);
  const studioId = sceneProp.studio && sceneProp.studio.id;

  useEffect(() => {
    let cancelled = false;
    getConfiguration(client).then((cfg) => {
      if (!cancelled) setConfig(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    setOverride(null);
  }, [sceneProp.id]);

  useEffect(() => {
    if (!studioId) {
      setEnrichedStudio(null);
      return;
    }
    let cancelled = false;
    client
      .query({
        query: ENRICH_STUDIO_QUERY,
        variables: { id: studioId },
        fetchPolicy: "network-only",
      })
      .then(({ data }: any) => {
        if (!cancelled) setEnrichedStudio((data && data.findStudio) || null);
      });
    return () => {
      cancelled = true;
    };
  }, [client, studioId]);

  if (!config) {
    return null;
  }

  const baseScene = override || sceneProp;
  const effectiveScene =
    !override && enrichedStudio && enrichedStudio.id === studioId
      ? { ...baseScene, studio: enrichedStudio }
      : baseScene;
  const plan: any = planScene(effectiveScene, config);

  async function handleMoveOne(sceneId: string) {
    setPending(true);
    try {
      const jobId = await runRenameTask(client, { sceneIds: [sceneId] });
      await new Promise<void>((resolve) => {
        pollJob(client, jobId, (jobInfo) => {
          if (isTerminalStatus(jobInfo.status)) {
            resolve();
          }
        });
      });
      const { data } = await client.query({
        query: FIND_SCENE_QUERY,
        variables: { id: sceneId },
        fetchPolicy: "network-only",
      });
      if (data && data.findScene) {
        setOverride(data.findScene);
      }
    } finally {
      setPending(false);
    }
  }

  const ruleLabel = matchedRuleLabel(plan, config.rules || []);
  const TruncatedText = PluginApi.components.TruncatedText;
  const aggregateStatus = pending
    ? "pending"
    : plan.status !== "ok"
      ? plan.status
      : plan.files.some((f: any) => !f.unchanged)
        ? "will-move"
        : "unchanged";

  return (
    <div className="librarian-scene-file-info-block">
      <h4>Librarian</h4>
      <div className="librarian-scene-file-info-summary">
        {ruleLabel && (
          <p className="librarian-token-hint text-muted">
            <Link to={SETTINGS_ROUTE} title="Open Librarian settings">
              {ruleLabel}
            </Link>
          </p>
        )}
        {plan.status === "error" && (
          <p className="librarian-token-hint text-danger">
            {describeMissingData(plan.missingData, stashBoxes)}
          </p>
        )}
        {plan.status === "skipped" && (
          <p className="librarian-token-hint text-muted librarian-organize-hint">
            {skippedText(plan.reason, plan.excludedBy)}{" "}
            {plan.reason === "not_organized" && (
              <OrganizeButton
                scene={effectiveScene}
                onOrganized={(sceneId, patchedScene) =>
                  setOverride(patchedScene)
                }
              />
            )}
          </p>
        )}
        {plan.status === "ok" && (
          <>
            <dl className="container scene-file-info details-list librarian-scene-file-info-paths">
              {plan.files.map((f: any) => {
                const pathClass = f.unchanged ? "correct-path" : "new-path";
                return (
                  <React.Fragment key={f.fileId}>
                    <dt>Folder:</dt>
                    <dd className={pathClass}>
                      <TruncatedText text={f.folder} />
                    </dd>
                    <dt>Filename:</dt>
                    <dd className={pathClass}>
                      <TruncatedText text={f.basename} />
                    </dd>
                  </React.Fragment>
                );
              })}
            </dl>
            <StatusBadge
              status={aggregateStatus}
              onClick={
                aggregateStatus === "will-move"
                  ? () => handleMoveOne(effectiveScene.id)
                  : undefined
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
