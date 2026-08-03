import React, { useEffect, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { Link } from "react-router-dom";
import { getConfiguration } from "../shared/stash-api.js";
import { SETTINGS_ROUTE } from "../shared/SettingsLink.js";

const PluginApi = (window as any).PluginApi;
const { Button } = PluginApi.libraries.Bootstrap;

export function PluginSettingsSummary() {
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
        Loading...
      </div>
    );
  }

  const rules: any[] = config.rules || [];
  const enabledRules = rules.filter((r) => r.enabled !== false);
  const UNNAMED_RULE_RE = /^Unnamed rule( \d+)?$/;
  const namedEnabledRules = enabledRules.filter(
    (r) => r.name && !UNNAMED_RULE_RE.test(r.name),
  );
  const unnamedEnabledCount = enabledRules.length - namedEnabledRules.length;

  const needsLibraryRoot =
    !config.defaultPattern.libraryRoot ||
    rules.some((r) => r.enabled !== false && !r.libraryRoot);

  function renderRulesList() {
    if (rules.length === 0) {
      return (
        <p className="librarian-token-hint text-muted">
          No rules configured yet
        </p>
      );
    }
    if (enabledRules.length === 0) {
      return (
        <p className="librarian-token-hint text-muted">No rules enabled</p>
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
              ? `and ${unnamedEnabledCount} more`
              : `${unnamedEnabledCount} unnamed rule${unnamedEnabledCount === 1 ? "" : "s"}`}
          </li>
        )}
      </ul>
    );
  }

  return (
    <div className="plugin-settings librarian-plugin-settings-summary">
      <div className="librarian-plugin-settings-header">
        <h5>Current rules</h5>
        <Button as={Link as any} to={SETTINGS_ROUTE} variant="primary">
          Librarian settings
        </Button>
      </div>
      {renderRulesList()}
      {needsLibraryRoot && (
        <p className="librarian-token-hint text-danger">
          Some library roots still need to be set
        </p>
      )}
    </div>
  );
}
