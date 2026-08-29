import React, { useEffect } from "react";
import { SettingsPage } from "./settings-page/SettingsPage.js";
import { PluginSettingsSummary } from "./settings-page/PluginSettingsSummary.js";
import { RenameScenesButton } from "./scenes-button/RenameScenesButton.js";
import { PreviewSceneList } from "./scenes-button/PreviewSceneList.js";
import {
  PreviewModeProvider,
  usePreviewMode,
} from "./scenes-button/preview-context.js";
import { SettingsLink, SETTINGS_ROUTE } from "./shared/SettingsLink.js";
import { StashBoxesProvider } from "./shared/StashBoxesContext.js";
import { SceneFileInfoBlock } from "./scene-file-info/SceneFileInfoBlock.js";
import { LibrarianIntlProvider } from "./i18n/LibrarianIntlProvider.js";
import { PLUGIN_ID } from "../core/config-schema.js";

const LOG_PREFIX = "[librarian]";

const PluginApi = (window as any).PluginApi;

function SettingsRoute() {
  return (
    <LibrarianIntlProvider>
      <SettingsPage />
    </LibrarianIntlProvider>
  );
}

try {
  PluginApi.register.route(SETTINGS_ROUTE, SettingsRoute);
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
    return (
      <LibrarianIntlProvider>
        <PluginSettingsSummary />
      </LibrarianIntlProvider>
    );
  });
} catch (e) {
  console.error(LOG_PREFIX, "patch.instead(PluginSettings) threw", e);
}

try {
  PluginApi.patch.instead("FilteredSceneList", (...args: any[]) => {
    const next = args[args.length - 1];
    const originalArgs = args.slice(0, -1);
    return (
      <PreviewModeProvider>
        <StashBoxesProvider>
          <LibrarianIntlProvider>
            <div className="librarian-toolbar">
              <RenameScenesButton />
              <SettingsLink />
            </div>
          </LibrarianIntlProvider>
          {next(...originalArgs)}
        </StashBoxesProvider>
      </PreviewModeProvider>
    );
  });
} catch (e) {
  console.error(LOG_PREFIX, "patch.instead(FilteredSceneList) threw", e);
}

function ScenesPreviewSwitch({
  props,
  next,
}: {
  props: any;
  next: (props: any) => any;
}) {
  const { active, reportDisplayMode } = usePreviewMode();
  const { scenes, filter } = props;
  const Next = next as React.ComponentType<any>;

  useEffect(() => {
    reportDisplayMode(filter);
  }, [filter, reportDisplayMode]);

  if (!active) {
    return <Next {...props} />;
  }
  return (
    <LibrarianIntlProvider>
      <PreviewSceneList scenes={scenes} />
    </LibrarianIntlProvider>
  );
}

try {
  PluginApi.patch.after("SceneFileInfoPanel", (...args: any[]) => {
    const result = args[args.length - 1];
    const props = args[0] || {};
    return (
      <>
        {result}
        <StashBoxesProvider>
          <LibrarianIntlProvider>
            <SceneFileInfoBlock scene={props.scene} />
          </LibrarianIntlProvider>
        </StashBoxesProvider>
      </>
    );
  });
} catch (e) {
  console.error(LOG_PREFIX, "patch.after(SceneFileInfoPanel) threw", e);
}

try {
  PluginApi.patch.instead("SceneList", (...args: any[]) => {
    const next = args[args.length - 1];
    const props = args[0] || {};
    return (
      <StashBoxesProvider>
        <ScenesPreviewSwitch props={props} next={next} />
      </StashBoxesProvider>
    );
  });
} catch (e) {
  console.error(LOG_PREFIX, "patch.instead(SceneList) threw", e);
}
