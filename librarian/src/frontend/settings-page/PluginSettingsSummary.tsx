import React, { useEffect, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { useIntl } from "react-intl";
import { Link } from "react-router-dom";
import { getConfiguration } from "../shared/stash-api.js";
import { SETTINGS_ROUTE } from "../shared/SettingsLink.js";
import { folderPatternMode } from "../../core/path-template.js";

const PluginApi = (window as any).PluginApi;
const { Button } = PluginApi.libraries.Bootstrap;

export function PluginSettingsSummary() {
  const intl = useIntl();
  const client = useApolloClient();
  const [config, setConfig] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;
    getConfiguration(client).then((cfg) => {
      if (!cancelled) setConfig(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (!config) {
    return (
      <div className="plugin-settings librarian-plugin-settings-summary">
        {intl.formatMessage({ id: "loading.generic" })}
      </div>
    );
  }

  const scenes: any = config.scenes || {};
  const rules: any[] = scenes.rules || [];
  const enabledRules = rules.filter((r) => r.enabled !== false);
  // Matches the literal English default RuleList.tsx stores in rule.name, not
  // display text, so this stays untranslated regardless of the active locale.
  const UNNAMED_RULE_RE = /^Unnamed rule( \d+)?$/;
  const namedEnabledRules = enabledRules.filter(
    (r) => r.name && !UNNAMED_RULE_RE.test(r.name),
  );
  const unnamedEnabledCount = enabledRules.length - namedEnabledRules.length;

  // keep-in-place patterns never leave the file's own folder, so they need no root
  const rootRequired = (p: any) =>
    folderPatternMode(p && p.folderPattern) !== "keep" && !p.libraryRoot;
  const needsLibraryRoot =
    rootRequired(scenes.defaultPattern || {}) ||
    rules.some((r) => r.enabled !== false && rootRequired(r));

  function renderRulesList() {
    if (rules.length === 0) {
      return (
        <p className="librarian-token-hint text-muted">
          {intl.formatMessage({
            id: "librarian.pluginSettingsSummary.noRulesConfigured",
          })}
        </p>
      );
    }
    if (enabledRules.length === 0) {
      return (
        <p className="librarian-token-hint text-muted">
          {intl.formatMessage({
            id: "librarian.pluginSettingsSummary.noRulesEnabled",
          })}
        </p>
      );
    }
    return (
      <ul className="librarian-plugin-settings-rules">
        {namedEnabledRules.map((r, i) => (
          <li key={r.id || i}>{r.name}</li>
        ))}
        {unnamedEnabledCount > 0 && (
          <li className="text-muted">
            {namedEnabledRules.length > 0
              ? intl.formatMessage(
                  { id: "librarian.pluginSettingsSummary.andMore" },
                  { count: unnamedEnabledCount },
                )
              : intl.formatMessage(
                  { id: "librarian.pluginSettingsSummary.unnamedCount" },
                  { count: unnamedEnabledCount },
                )}
          </li>
        )}
      </ul>
    );
  }

  return (
    <div className="plugin-settings librarian-plugin-settings-summary">
      <div className="librarian-plugin-settings-header">
        <h5>
          {intl.formatMessage({
            id: "librarian.pluginSettingsSummary.heading",
          })}
        </h5>
        <Button as={Link as any} to={SETTINGS_ROUTE} variant="primary">
          {intl.formatMessage({
            id: "librarian.pluginSettingsSummary.settingsLink",
          })}
        </Button>
      </div>
      {renderRulesList()}
      {needsLibraryRoot && (
        <p className="librarian-token-hint text-danger">
          {intl.formatMessage({
            id: "librarian.pluginSettingsSummary.needsLibraryRoot",
          })}
        </p>
      )}
    </div>
  );
}
