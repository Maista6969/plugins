import React from "react";
import { StatusBadge } from "./StatusBadge.js";
import { OrganizeButton } from "./OrganizeButton.js";
import { describeMissingData } from "./describe-missing.js";
import { useStashBoxes } from "./StashBoxesContext.js";
import {
  describePatternPair,
  joinBasename,
} from "../../core/path-template.js";

const PluginApi = (window as any).PluginApi;
const { Table } = PluginApi.libraries.Bootstrap;

export interface PlanRow {
  scene: any;
  plan: any;
}

interface PlanResultTableProps {
  rows: PlanRow[];
  onMoveOne?: (sceneId: string) => void;
  pendingSceneIds?: Set<string>;
  onSceneOrganized?: (sceneId: string, patchedScene: any) => void;
  rules?: any[];
}

function resolveMatchedRule(
  plan: any,
  rules: any[],
): { label: string; pattern?: string } | undefined {
  if (plan.status !== "ok" && plan.status !== "error") {
    return undefined;
  }
  const ruleId =
    plan.status === "ok"
      ? typeof plan.reason === "string" && plan.reason.indexOf("rule:") === 0
        ? plan.reason.slice("rule:".length)
        : null
      : plan.matchedRule;

  if (!ruleId) {
    return { label: "This scene uses the default pattern" };
  }
  const index = (rules || []).findIndex((r) => r.id === ruleId);
  if (index === -1) {
    return undefined;
  }
  const rule = rules[index];
  const label = rule.name
    ? "Matched rule " + (index + 1) + " (" + rule.name + ")"
    : "Matched rule " + (index + 1);
  const pattern = describePatternPair(rule.folderPattern, rule.filenamePattern);
  return { label, pattern: pattern || undefined };
}

export function matchedRuleTitle(plan: any, rules: any[]): string | undefined {
  const info = resolveMatchedRule(plan, rules);
  if (!info) {
    return undefined;
  }
  return info.label + (info.pattern ? ": " + info.pattern : "");
}

export function matchedRuleLabel(plan: any, rules: any[]): string | undefined {
  return resolveMatchedRule(plan, rules)?.label;
}

export function skippedText(reason: string, excludedBy?: string[]): string {
  if (reason === "not_organized") {
    return "Skipped: scene is not organized";
  }
  if (reason === "no_stash_id") {
    return "Skipped: scene has no StashID";
  }
  if (reason === "no_files") {
    return "Skipped: scene has no video files";
  }
  if (reason === "excluded") {
    return excludedBy && excludedBy.length > 0
      ? "Skipped: excluded because " + excludedBy.join(", ")
      : "Skipped: matches an exclusion condition";
  }
  return `Skipped: ${reason}`;
}

function sceneDisplayName(scene: any): string {
  if (scene.title) {
    return scene.title;
  }
  const firstPath = scene.files && scene.files[0] && scene.files[0].path;
  if (firstPath) {
    return firstPath.replace(/^.*[\\/]/, "");
  }
  return scene.id;
}

function coverImageLink(scene: any) {
  const screenshot = scene.paths && scene.paths.screenshot;
  if (!screenshot) {
    return null;
  }
  return (
    <a href={"/scenes/" + scene.id} target="_blank" rel="noopener noreferrer">
      <img
        loading="lazy"
        className="image-thumbnail"
        alt={sceneDisplayName(scene)}
        src={screenshot}
      />
    </a>
  );
}

function sceneLink(scene: any) {
  const name = sceneDisplayName(scene);
  return (
    <a
      href={"/scenes/" + scene.id}
      target="_blank"
      rel="noopener noreferrer"
      title={name}
    >
      <span className="ellips-data">{name}</span>
    </a>
  );
}

export function PlanResultTable({
  rows,
  onMoveOne,
  pendingSceneIds,
  onSceneOrganized,
  rules,
}: PlanResultTableProps) {
  // empty outside the settings page, where the message keeps the endpoint URL
  const { stashBoxes } = useStashBoxes();

  return (
    <div className="table-list librarian-plan-table">
      <Table striped bordered>
        <thead>
          <tr>
            <th className="cover_image-head">Cover Image</th>
            <th>Title</th>
            <th>Path</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ scene, plan }) => {
            const pending = !!pendingSceneIds && pendingSceneIds.has(scene.id);
            const ruleTitle = matchedRuleTitle(plan, rules || []);
            return (
              <React.Fragment key={scene.id}>
                {plan.status !== "ok" ? (
                  <tr>
                    <td className="cover_image-data">
                      {coverImageLink(scene)}
                    </td>
                    <td>{sceneLink(scene)}</td>
                    <td className="librarian-message-cell">
                      {plan.status === "error" ? (
                        "Error: " +
                        describeMissingData(plan.missingData, stashBoxes)
                      ) : plan.reason === "not_organized" ? (
                        <span className="librarian-organize-hint">
                          {skippedText(plan.reason)}{" "}
                          <OrganizeButton
                            scene={scene}
                            onOrganized={onSceneOrganized}
                          />
                        </span>
                      ) : (
                        skippedText(plan.reason, plan.excludedBy)
                      )}
                    </td>
                    <td>
                      <StatusBadge status={plan.status} title={ruleTitle} />
                    </td>
                  </tr>
                ) : (
                  plan.files.map((f: any) => (
                    <tr key={f.fileId}>
                      <td className="cover_image-data">
                        {coverImageLink(scene)}
                      </td>
                      <td>{sceneLink(scene)}</td>
                      <td className="librarian-path-diff">
                        {f.unchanged ? (
                          <div className="correct-path">{f.currentPath}</div>
                        ) : (
                          (() => {
                            const newPath = joinBasename(f.folder, f.basename);
                            const shorterLength = Math.min(
                              f.currentPath.length,
                              newPath.length,
                            );
                            return (
                              <>
                                <div className="old-path text-muted">
                                  {f.currentPath}
                                </div>
                                <div
                                  className="librarian-path-diff-arrow text-muted"
                                  style={{
                                    marginLeft: shorterLength / 2 + "ch",
                                  }}
                                >
                                  ↓
                                </div>
                                <div className="new-path">{newPath}</div>
                              </>
                            );
                          })()
                        )}
                      </td>
                      <td>
                        <StatusBadge
                          status={
                            pending
                              ? "pending"
                              : f.unchanged
                                ? "unchanged"
                                : "will-move"
                          }
                          onClick={
                            onMoveOne && !pending
                              ? () => onMoveOne(scene.id)
                              : undefined
                          }
                          title={ruleTitle}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
