import React from "react";
import { DoppelgangerPage } from "./DoppelgangerPage.js";
import { PluginSettingsSummary } from "./PluginSettingsSummary.js";
import { registerToolsLauncher } from "./ToolsLauncher.js";
import { SETTINGS_ROUTE } from "./shared/SettingsLink.js";
import { PLUGIN_ID } from "./shared/plugin-id.js";

const LOG_PREFIX = "[doppelganger]";

const PluginApi = (window as any).PluginApi;

console.debug(LOG_PREFIX, "entry.tsx loaded", { PluginApi });

try {
  PluginApi.register.route(SETTINGS_ROUTE, DoppelgangerPage);
  console.debug(LOG_PREFIX, "registered route", SETTINGS_ROUTE);
} catch (e) {
  console.error(LOG_PREFIX, "register.route threw", e);
}

try {
  PluginApi.patch.instead("PluginSettings", (...args: any[]) => {
    const next = args[args.length - 1];
    const props = args[0] || {};
    if (props.pluginID !== PLUGIN_ID) {
      return next(...args.slice(0, -1));
    }
    console.debug(
      LOG_PREFIX,
      "PluginSettings.instead called for our own pluginID",
    );
    return <PluginSettingsSummary />;
  });
  console.debug(LOG_PREFIX, "patched PluginSettings");
} catch (e) {
  console.error(LOG_PREFIX, "patch.instead(PluginSettings) threw", e);
}

try {
  registerToolsLauncher();
  console.debug(LOG_PREFIX, "patched SettingsToolsSection");
} catch (e) {
  console.error(LOG_PREFIX, "patch.before(SettingsToolsSection) threw", e);
}
