import React from "react";
import { Link } from "react-router-dom";
import { SETTINGS_ROUTE } from "./shared/SettingsLink.js";

const PluginApi = (window as any).PluginApi;
const { Button } = PluginApi.libraries.Bootstrap;

// Stash's Scene Duplicate Checker lives here; sitting next to it is the whole
// point, since that is where someone hunting duplicates looks first.
const SCENE_DUPLICATE_CHECKER_ROUTE = "/sceneDuplicateChecker";

// Stash's Tools panel renders the SettingsToolsSection container twice: once
// for the general tools (GraphQL playground) and once for "Scene tools". A
// before-patch fires for both, so the scene one has to be recognised by what
// it already holds -- each child is a Setting whose heading is a Link.
function containsLinkTo(node: React.ReactNode, route: string): boolean {
  return React.Children.toArray(node).some((child) => {
    if (!React.isValidElement(child)) return false;
    const props = child.props as any;
    if (props.to === route) return true;
    return (
      containsLinkTo(props.heading, route) ||
      containsLinkTo(props.children, route)
    );
  });
}

export function registerToolsLauncher() {
  PluginApi.patch.before("SettingsToolsSection", (...args: any[]) => {
    const props = args[0] || {};
    if (!containsLinkTo(props.children, SCENE_DUPLICATE_CHECKER_ROUTE)) {
      return args;
    }

    const { Setting } = PluginApi.components;
    const launcher = (
      <Setting
        key="doppelganger-tools-launcher"
        heading={
          <Link to={SETTINGS_ROUTE}>
            <Button>Doppelganger</Button>
          </Link>
        }
        subHeading="Scenes, performers, tags and studios matched to the same stash-box entry twice, and scenes hiding identical copies of a file."
      />
    );

    return [
      {
        ...props,
        children: (
          <>
            {props.children}
            {launcher}
          </>
        ),
      },
      ...args.slice(1),
    ];
  });
}
