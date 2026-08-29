import React, { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { ruleToPreviewFilter } from "../../core/rule-to-filter.js";
import { useManualEntityPreview } from "./useManualEntityPreview.js";
import { PlanResultTable } from "../shared/PlanResultTable.js";
import { PreviewSortSelect } from "./PreviewSortSelect.js";
import { ApplyRuleButton } from "./ApplyRuleButton.js";
import { countableNoun } from "../shared/eligible-entities.js";
import {
  DEFAULT_PREVIEW_SORT,
  PREVIEW_REFRESH_DEBOUNCE_MS,
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
  const intl = useIntl();
  const type = entityType || "scenes";
  const sceneFilter = ruleToPreviewFilter(rule, config[type]);
  const { rows, loading, run, replan, handleEntityOrganized } =
    useManualEntityPreview(config, type);
  const [closed, setClosed] = useState(false);
  const [sort, setSort] = useState(DEFAULT_PREVIEW_SORT);

  const notReady = sceneFilter === null;
  const visible = rows !== null && !closed;

  // An "every performer" condition cannot be expressed as a filter
  // so the query over-selects and some rows are claimed by no rule at all
  function isNotThisRulesWork(plan: any): boolean {
    if (plan.status !== "ok") {
      return false;
    }
    if (rule.enabled === false) {
      return (
        plan.reason.indexOf("rule:") === 0 && plan.reason !== "rule:" + rule.id
      );
    }
    return plan.reason !== "rule:" + rule.id;
  }

  function handlePreviewClick() {
    setClosed(false);
    run(sceneFilter, sort, isNotThisRulesWork);
  }

  function handleReshuffle() {
    run(sceneFilter, sort, isNotThisRulesWork);
  }

  // Two kinds of invalidation. A different filter means a different set of
  // matching entities, so the server has to be asked again. Anything else only
  // changes the rendered outcome for entities already in hand, so re-plan
  // locally: that keeps typing in a pattern free of a query per keystroke.
  const filterKey = JSON.stringify({ entityType: type, filter: sceneFilter });
  // conditions are deliberately left out, being already covered by filterKey
  const { conditions, conditionLogic, ...planningRule } = rule;
  const planKey = JSON.stringify({
    rule: planningRule,
    delimiters: config.delimiters,
    sanitize: config.sanitize,
  });

  useEffect(() => {
    if (rows === null || closed) {
      return;
    }
    const timer = setTimeout(() => {
      run(sceneFilter, sort, isNotThisRulesWork);
    }, PREVIEW_REFRESH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    if (rows !== null && !closed) {
      replan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  const sortKey = JSON.stringify(sort);
  useEffect(() => {
    if (rows !== null && !closed) {
      run(sceneFilter, sort, isNotThisRulesWork);
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
                ? intl.formatMessage({
                    id: "librarian.configPreviewPanel.previewing",
                  })
                : intl.formatMessage(
                    { id: "librarian.configPreviewPanel.previewMatching" },
                    { entityNoun: countableNoun(intl, type) },
                  )}
            </Button>
          )}
          {visible && (
            <Button
              variant="secondary"
              onClick={() => setClosed(true)}
              title={intl.formatMessage({
                id: "librarian.configPreviewPanel.closePreviewTitle",
              })}
            >
              {intl.formatMessage({
                id: "librarian.configPreviewPanel.closePreview",
              })}
            </Button>
          )}
          {notReady && (
            <span className="librarian-token-hint text-muted">
              {intl.formatMessage({
                id: "librarian.rulePreviewPanel.notReady",
              })}
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
              {intl.formatMessage(
                { id: "librarian.rulePreviewPanel.noneMatch" },
                { entityNoun: countableNoun(intl, type) },
              )}
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
