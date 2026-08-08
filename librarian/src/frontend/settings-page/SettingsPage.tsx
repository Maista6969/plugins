import React, { useEffect, useRef, useState } from "react";
import { useApolloClient } from "@apollo/client";
import {
  getConfiguration,
  setConfiguration,
  findDeadEntityIds,
  fetchLibraryPaths,
} from "../shared/stash-api.js";
import { normalizeConfig } from "../../core/config-schema.js";
import {
  collectEntityIdsAll,
  pruneDeadEntitiesAll,
} from "../../core/prune-dead-entities.js";
import { pruneDeadLibraryRootsAll } from "../../core/prune-dead-library-roots.js";
import { TextSettingModal } from "./TextSettingModal.js";
import { EntitySettingsPanel } from "./EntitySettingsPanel.js";
import { ConfigPreviewPanel } from "./ConfigPreviewPanel.js";
import { SettingsSection } from "./SettingsSection.js";
import { LibraryPathsProvider } from "../shared/LibraryPathsContext.js";
import {
  StashBoxesProvider,
  useStashBoxes,
} from "../shared/StashBoxesContext.js";
import { TokenizedText } from "../shared/TokenizedText.js";
import { useLoadSettingsComponents } from "../shared/useLoadSettingsComponents.js";
import { usePluginPageTitle } from "./usePluginPageTitle.js";
import { ENTITY_TYPES } from "../../core/config-schema.js";
import { adapterFor } from "../../core/entity-adapter.js";

const PluginApi = (window as any).PluginApi;
const { Spinner, Nav } = PluginApi.libraries.Bootstrap;
const { faCheckCircle, faTimesCircle } = PluginApi.libraries.FontAwesomeSolid;
const Icon = PluginApi.components.Icon;

const AUTOSAVE_DEBOUNCE_MS = 500;
const SUCCESS_INDICATOR_MS = 4000;

function prunedEntitiesText(
  removedReferences: number,
  removedRules: number,
): string {
  const refPart =
    removedReferences === 1
      ? "1 reference to a deleted performer/tag/studio"
      : removedReferences + " references to deleted performers/tags/studios";
  if (removedRules === 0) {
    return "Cleaned up " + refPart;
  }
  const rulePart =
    removedRules === 1
      ? "1 rule that had none left"
      : removedRules + " rules that had none left";
  return "Cleaned up " + refPart + ", removing " + rulePart;
}

function prunedLibraryRootsText(
  disabledRules: number,
  clearedDefault: boolean,
): string {
  const parts: string[] = [];
  if (disabledRules === 1) {
    parts.push("disabled 1 rule");
  } else if (disabledRules > 1) {
    parts.push("disabled " + disabledRules + " rules");
  }
  if (clearedDefault) {
    parts.push("cleared the default pattern's library root");
  }
  return (
    "A configured library no longer exists in Stash: " + parts.join(" and ")
  );
}

export function SettingsPage() {
  return (
    <LibraryPathsProvider>
      <StashBoxesProvider>
        <SettingsPageContent />
      </StashBoxesProvider>
    </LibraryPathsProvider>
  );
}

function SettingsPageContent() {
  const client = useApolloClient();
  const [config, setConfig] = useState<any | null>(null);
  const [pendingConfig, setPendingConfig] = useState<any>(undefined);
  const [entityType, setEntityType] = useState<string>("scenes");
  const [updateSuccess, setUpdateSuccess] = useState<boolean | undefined>(
    undefined,
  );
  const successTimerRef = useRef<any>(null);
  const Toast = PluginApi.hooks.useToast();
  const pluginName = usePluginPageTitle();

  const loadingSettingsComponents = useLoadSettingsComponents();

  useEffect(() => {
    let cancelled = false;
    getConfiguration(client).then(async (cfg) => {
      let effectiveConfig = cfg;
      try {
        const referencedIds = collectEntityIdsAll(cfg);
        const deadIds = await findDeadEntityIds(client, referencedIds);
        const pruned = pruneDeadEntitiesAll(effectiveConfig, deadIds);
        if (pruned.config !== effectiveConfig) {
          effectiveConfig = pruned.config;
          Toast.success(
            prunedEntitiesText(pruned.removedReferences, pruned.removedRules),
          );
        }
      } catch (e) {
        console.error("[librarian] dead-entity cleanup check failed", e);
      }
      try {
        const validPaths = await fetchLibraryPaths(client);
        const prunedRoots = pruneDeadLibraryRootsAll(
          effectiveConfig,
          validPaths,
        );
        if (prunedRoots.config !== effectiveConfig) {
          effectiveConfig = prunedRoots.config;
          Toast.success(
            prunedLibraryRootsText(
              prunedRoots.disabledRules,
              prunedRoots.clearedDefault,
            ),
          );
        }
      } catch (e) {
        console.error("[librarian] dead-library-root cleanup check failed", e);
      }
      if (!cancelled) {
        setConfig(effectiveConfig);
        if (effectiveConfig !== cfg) {
          setPendingConfig(effectiveConfig);
        }
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  // Automatically save changes to the settings just like Stash does
  useEffect(() => {
    if (pendingConfig === undefined) {
      return;
    }
    const timer = setTimeout(() => {
      setUpdateSuccess(undefined);
      const normalized = normalizeConfig(pendingConfig);
      setConfiguration(client, normalized)
        .then(() => {
          setPendingConfig(undefined);
          setUpdateSuccess(true);
          if (successTimerRef.current) {
            clearTimeout(successTimerRef.current);
          }
          successTimerRef.current = setTimeout(
            () => setUpdateSuccess(undefined),
            SUCCESS_INDICATOR_MS,
          );
        })
        .catch((e: any) => {
          Toast.error(e);
          setUpdateSuccess(false);
        });
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingConfig, client]);

  if (!config || loadingSettingsComponents) {
    return <div className="librarian-settings-page">Loading...</div>;
  }

  function updateConfig(next: any) {
    setConfig(next);
    setPendingConfig(next);
  }

  function updateSection(type: string, patch: any) {
    updateConfig({ ...config, [type]: { ...config[type], ...patch } });
  }

  function renderLoadingIndicator() {
    if (updateSuccess === false) {
      return (
        <div className="loading-indicator failed">
          <Icon icon={faTimesCircle} className="fa-fw" />
        </div>
      );
    }
    if (pendingConfig !== undefined) {
      return (
        <div className="loading-indicator">
          <Spinner animation="border" role="status">
            <span className="sr-only">Loading...</span>
          </Spinner>
        </div>
      );
    }
    if (updateSuccess) {
      return (
        <div className="loading-indicator success">
          <Icon icon={faCheckCircle} className="fa-fw" />
        </div>
      );
    }
    return null;
  }

  return (
    <div className="librarian-settings-page">
      {renderLoadingIndicator()}
      <h2>{pluginName || "Settings"}</h2>

      <div className="librarian-entity-tabs">
        <Nav
          variant="tabs"
          activeKey={entityType}
          onSelect={(k: string | null) => k && setEntityType(k)}
        >
          {ENTITY_TYPES.map((type) => (
            <Nav.Item key={type}>
              <Nav.Link eventKey={type}>{adapterFor(type).label}</Nav.Link>
            </Nav.Item>
          ))}
        </Nav>
        <div className="librarian-entity-tab-panel">
          {/* keyed so switching tabs remounts the panel: no per-tab component
              state (open modals, drag state, preview toggles) can leak across */}
          <EntitySettingsPanel
            key={entityType}
            entityType={entityType}
            config={config}
            onChange={updateSection}
          />
        </div>
      </div>

      <div className="librarian-global-settings">
        <SettingsSection heading="Formatting (all types)">
          <div className="content">
            <p className="librarian-token-hint text-muted">
              Changes apply to how all folder and file names are formatted
            </p>
            <TextSettingModal
              heading="Space replacement"
              subHeading="Replaces spaces in every folder and filename with this text (like “.” or “_”). Leave blank to keep spaces as they are"
              value={config.sanitize && config.sanitize.spaceReplacement}
              onChange={(spaceReplacement: string) =>
                updateConfig({
                  ...config,
                  sanitize: { ...config.sanitize, spaceReplacement },
                })
              }
              placeholder="(do not change spaces)"
            />
            <TextSettingModal
              heading="Performers delimiter"
              subHeading={
                <TokenizedText text="Joins {performers}/{performers_not_in_title}/{matched_performers} with this text" />
              }
              value={config.delimiters && config.delimiters.performers}
              onChange={(performers: string) =>
                updateConfig({
                  ...config,
                  delimiters: { ...config.delimiters, performers },
                })
              }
              placeholder=", "
            />
            <TextSettingModal
              heading="Tags delimiter"
              subHeading={
                <TokenizedText text="Joins {tags}/{matched_tags} with this text" />
              }
              value={config.delimiters && config.delimiters.tags}
              onChange={(tags: string) =>
                updateConfig({
                  ...config,
                  delimiters: { ...config.delimiters, tags },
                })
              }
              placeholder=", "
            />
          </div>
        </SettingsSection>
      </div>

      <div className="setting-section librarian-config-preview-section">
        <h1>Preview {adapterFor(entityType).label.toLowerCase()}</h1>
        <p className="librarian-token-hint text-muted">
          Shows what the current rules would do to a sample of recent{" "}
          {adapterFor(entityType).plural}
        </p>
        {/* keyed like the settings panel so switching tabs cannot leave rows
            from another entity type on screen */}
        <ConfigPreviewPanel
          key={entityType}
          config={config}
          entityType={entityType}
        />
      </div>
    </div>
  );
}
