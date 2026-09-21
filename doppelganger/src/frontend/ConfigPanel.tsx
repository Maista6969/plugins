import React from "react";
import { PLUGIN_ID } from "./shared/plugin-id.js";

const PluginApi = (window as any).PluginApi;
const { Button, Card, Collapse, Form } = PluginApi.libraries.Bootstrap;
const { faCog } = PluginApi.libraries.FontAwesomeSolid;
const { Icon } = PluginApi.components;

export interface DoppelgangerConfig {
  keepPrimaryAfterMerge: boolean;
}

const DEFAULTS: DoppelgangerConfig = {
  keepPrimaryAfterMerge: false,
};

// Settings live in Stash's plugin configuration (Settings > Plugins), so they
// follow the instance rather than the browser. Read through the same query
// Stash's own settings pages use, written through configurePlugin.
export function useDoppelgangerConfig(): [
  DoppelgangerConfig,
  (patch: Partial<DoppelgangerConfig>) => void,
] {
  const { data } = PluginApi.GQL.useConfigurationQuery();
  const [configurePlugin] = PluginApi.utils.StashService.useConfigurePlugin();

  const stored = data?.configuration?.plugins?.[PLUGIN_ID] ?? {};
  const config: DoppelgangerConfig = { ...DEFAULTS, ...stored };

  function update(patch: Partial<DoppelgangerConfig>) {
    configurePlugin({
      variables: { plugin_id: PLUGIN_ID, input: { ...stored, ...patch } },
    });
  }

  return [config, update];
}

// The cog button and collapsible panel follow Stash's scene tagger
// (components/Tagger/TaggerConfig.tsx), so the page reads as one of its own.
export function ConfigButton({
  showConfig,
  onClick,
}: {
  showConfig: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      onClick={onClick}
      title={showConfig ? "Hide configuration" : "Show configuration"}
    >
      <Icon className="fa-fw" icon={faCog} />
    </Button>
  );
}

export function ConfigPanel({
  show,
  config,
  onChange,
}: {
  show: boolean;
  config: DoppelgangerConfig;
  onChange: (patch: Partial<DoppelgangerConfig>) => void;
}) {
  return (
    <Collapse in={show}>
      <Card>
        <div className="row">
          <h4 className="col-12">Configuration</h4>
          <hr className="w-100" />
          <div className="col-md-6">
            <Form.Group>
              <Form.Check
                id="doppelganger-keep-primary-after-merge"
                label="After merging scenes, keep only the merge target's primary file"
                checked={config.keepPrimaryAfterMerge}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onChange({ keepPrimaryAfterMerge: e.currentTarget.checked })
                }
              />
              <Form.Text>
                Skips the file chooser after a merge: the files that came from
                the merged scenes are deleted through Stash&apos;s file deletion
                as soon as the merge completes. Leave off to pick the file to
                keep each time.
              </Form.Text>
            </Form.Group>
          </div>
        </div>
      </Card>
    </Collapse>
  );
}
