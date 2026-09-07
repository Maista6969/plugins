import React from "react";
import { Link } from "react-router-dom";
import { SETTINGS_ROUTE } from "./shared/SettingsLink.js";

const PluginApi = (window as any).PluginApi;
const { Button } = PluginApi.libraries.Bootstrap;

export function PluginSettingsSummary() {
  return (
    <div className="plugin-settings">
      <p className="text-muted">
        Finds scenes, performers, tags, and studios matched to the same
        stash-box entry more than once, and scenes hiding identical copies of
        the same file.
      </p>
      <Button as={Link as any} to={SETTINGS_ROUTE} variant="primary">
        Find duplicates
      </Button>
    </div>
  );
}
