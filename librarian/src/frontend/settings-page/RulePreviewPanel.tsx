import React, { useEffect, useState } from "react";
import { ruleToPreviewFilter } from "../../core/rule-to-filter.js";
import { useManualEntityPreview } from "./useManualEntityPreview.js";
import { PlanResultTable } from "../shared/PlanResultTable.js";
import { PreviewSortSelect } from "./PreviewSortSelect.js";
import { ApplyRuleButton } from "./ApplyRuleButton.js";
import { adapterFor } from "../../core/entity-adapter.js";
import {
  DEFAULT_PREVIEW_SORT,
  changeSortField,
  toggleSortDirection,
} from "./entity-preview-query.js";

interface RulePreviewPanelProps {
  rule: any;
  config: any;
  entityType?: string;
}

const PluginApi = (window as any).PluginApi;
const { Button } = PluginApi.libraries.Bootstrap;

export function RulePreviewPanel({
  rule,
  config,
  entityType,
}: RulePreviewPanelProps) {
  const type = entityType || "scenes";
  const sceneFilter = ruleToPreviewFilter(rule, config[type]);
  const { rows, loading, run, handleEntityOrganized } = useManualEntityPreview(
    config,
    type,
  );
  const [closed, setClosed] = useState(false);
  const [sort, setSort] = useState(DEFAULT_PREVIEW_SORT);

  const notReady = sceneFilter === null;
  const visible = rows !== null && !closed;

  function isStolenByAnotherRule(plan: any): boolean {
    return (
      plan.status === "ok" &&
      plan.reason.indexOf("rule:") === 0 &&
      plan.reason !== "rule:" + rule.id
    );
  }

  function handlePreviewClick() {
    setClosed(false);
    run(sceneFilter, sort, isStolenByAnotherRule);
  }

  function handleReshuffle() {
    run(sceneFilter, sort, isStolenByAnotherRule);
  }

  const ruleContentKey = JSON.stringify({
    sceneFilter,
    folderPattern: rule.folderPattern,
    filenamePattern: rule.filenamePattern,
    sortBy: rule.sortBy,
    spaceReplacement: config.sanitize && config.sanitize.spaceReplacement,
  });
  useEffect(() => {
    setClosed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleContentKey]);

  const sortKey = JSON.stringify(sort);
  useEffect(() => {
    if (rows !== null && !closed) {
      run(sceneFilter, sort, isStolenByAnotherRule);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey]);

  return (
    <div className="librarian-rule-preview">
      <div className="librarian-rule-preview-controls">
        <div className="librarian-rule-preview-controls-left">
          <PreviewSortSelect
            field={sort.field}
            direction={sort.direction}
            onChangeField={(field) => setSort(changeSortField(field))}
            onToggleDirection={() => setSort(toggleSortDirection(sort))}
            onReshuffle={visible ? handleReshuffle : undefined}
            reshuffling={loading}
          />
          {!visible && (
            <Button
              variant="secondary"
              disabled={notReady || loading}
              onClick={handlePreviewClick}
            >
              {loading
                ? "Previewing..."
                : "Preview matching " + adapterFor(type).plural}
            </Button>
          )}
          {visible && (
            <Button
              variant="secondary"
              onClick={() => setClosed(true)}
              title="Close this preview"
            >
              Close preview
            </Button>
          )}
          {notReady && (
            <span className="librarian-token-hint text-muted">
              Fill in this rule's conditions to enable preview
            </span>
          )}
        </div>
        <div className="librarian-rule-preview-controls-right">
          <ApplyRuleButton rule={rule} config={config} entityType={type} />
        </div>
      </div>

      {visible && (
        <div className="librarian-rule-preview-results">
          {rows.length === 0 ? (
            <div className="librarian-token-hint text-muted">
              No {adapterFor(type).plural} currently match this rule's
              conditions
            </div>
          ) : (
            <PlanResultTable
              rows={rows}
              onEntityOrganized={handleEntityOrganized}
              rules={(config[type] || {}).rules}
              entityType={type}
            />
          )}
        </div>
      )}
    </div>
  );
}
