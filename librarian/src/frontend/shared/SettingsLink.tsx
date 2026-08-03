import React from "react";
import { Link } from "react-router-dom";

const PluginApi = (window as any).PluginApi;
const { Button, OverlayTrigger, Tooltip } = PluginApi.libraries.Bootstrap;
const { faSchool } = PluginApi.libraries.FontAwesomeSolid;
const Icon = PluginApi.components.Icon;

export const SETTINGS_ROUTE = "/plugins/librarian";

export function SettingsLink() {
  return (
    <OverlayTrigger
      overlay={
        <Tooltip id="librarian-settings-tooltip">Librarian Settings</Tooltip>
      }
    >
      <Button as={Link as any} to={SETTINGS_ROUTE} variant="secondary">
        <Icon icon={faSchool} />
      </Button>
    </OverlayTrigger>
  );
}
