import React from "react";
import { Link } from "react-router-dom";
import { useIntl } from "react-intl";

const PluginApi = (window as any).PluginApi;
const { Button, OverlayTrigger, Tooltip } = PluginApi.libraries.Bootstrap;
const { faSchool } = PluginApi.libraries.FontAwesomeSolid;
const Icon = PluginApi.components.Icon;

export const SETTINGS_ROUTE = "/plugins/librarian";

export function SettingsLink() {
  const intl = useIntl();
  return (
    <OverlayTrigger
      overlay={
        <Tooltip id="librarian-settings-tooltip">
          {intl.formatMessage({ id: "librarian.settingsLink.tooltip" })}
        </Tooltip>
      }
    >
      <Button as={Link as any} to={SETTINGS_ROUTE} variant="secondary">
        <Icon icon={faSchool} />
      </Button>
    </OverlayTrigger>
  );
}
