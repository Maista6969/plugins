import React, { useEffect, useRef, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { useIntl, IntlShape } from "react-intl";
import {
  getConfiguration,
  setConfiguration,
  findDeadEntityIds,
  fetchLibraryPaths,
} from "../shared/stash-api.js";
import {
  normalizeConfig,
  resetFormatting,
  availableEntityTypes,
  resolveActiveType,
} from "../../core/config-schema.js";
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
import { StashBoxesProvider } from "../shared/StashBoxesContext.js";
import { TokenizedText } from "../shared/TokenizedText.js";
import { useLoadSettingsComponents } from "../shared/useLoadSettingsComponents.js";
import { usePluginPageTitle } from "./usePluginPageTitle.js";
import { useEntityCounts } from "./useEntityCounts.js";
import { countableNoun } from "../shared/eligible-entities.js";

const PluginApi = (window as any).PluginApi;
const { Spinner, Nav, Button } = PluginApi.libraries.Bootstrap;
const { faCheckCircle, faTimesCircle } = PluginApi.libraries.FontAwesomeSolid;
const Icon = PluginApi.components.Icon;

const AUTOSAVE_DEBOUNCE_MS = 500;
const SUCCESS_INDICATOR_MS = 4000;

function prunedEntitiesText(
  intl: IntlShape,
  removedReferences: number,
  removedRules: number,
): string {
  return intl.formatMessage(
    { id: "librarian.settingsPage.cleanup.entities" },
    { removedReferences, removedRules },
  );
}

function prunedLibraryRootsText(
  intl: IntlShape,
  disabledRules: number,
  clearedDefault: boolean,
): string {
  const parts: string[] = [];
  if (disabledRules > 0) {
    parts.push(
      intl.formatMessage(
        { id: "librarian.settingsPage.cleanup.disabledRules" },
        { count: disabledRules },
      ),
    );
  }
  if (clearedDefault) {
    parts.push(
      intl.formatMessage({
        id: "librarian.settingsPage.cleanup.clearedDefaultRoot",
      }),
    );
  }
  return intl.formatMessage(
    { id: "librarian.settingsPage.cleanup.libraryRoots" },
    { parts: parts.join(intl.formatMessage({ id: "librarian.common.and" })) },
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
  const intl = useIntl();
  const client = useApolloClient();
  const [config, setConfig] = useState<any | null>(null);
  const [pendingConfig, setPendingConfig] = useState<any>(undefined);
  const [entityType, setEntityType] = useState<string>("scenes");
  const { counts, loading: countsLoading } = useEntityCounts();

  const availableTypes = availableEntityTypes(counts);
  const activeType = resolveActiveType(availableTypes, entityType);
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
            prunedEntitiesText(
              intl,
              pruned.removedReferences,
              pruned.removedRules,
            ),
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
              intl,
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

  if (!config || loadingSettingsComponents || countsLoading) {
    return (
      <div className="librarian-settings-page">
        {intl.formatMessage({ id: "loading.generic" })}
      </div>
    );
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
            <span className="sr-only">
              {intl.formatMessage({ id: "loading.generic" })}
            </span>
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

  const fallbackTitle = intl.formatMessage({
    id: "settings",
  });

  if (availableTypes.length === 0) {
    return (
      <div className="librarian-settings-page">
        <h2>{pluginName || fallbackTitle}</h2>
        <p className="librarian-token-hint text-muted">
          {intl.formatMessage({ id: "librarian.settingsPage.emptyLibrary" })}
        </p>
      </div>
    );
  }

  return (
    <div className="librarian-settings-page">
      {renderLoadingIndicator()}
      <h2>{pluginName || fallbackTitle}</h2>

      <div className="librarian-entity-tabs">
        {availableTypes.length > 1 && (
          <Nav
            variant="tabs"
            activeKey={activeType}
            onSelect={(k: string | null) => k && setEntityType(k)}
          >
            {availableTypes.map((type) => (
              <Nav.Item key={type}>
                <Nav.Link eventKey={type}>
                  {countableNoun(intl, type, true, true)}
                </Nav.Link>
              </Nav.Item>
            ))}
          </Nav>
        )}
        <div className="librarian-entity-tab-panel">
          {/* keyed so switching tabs remounts the panel: no per-tab component
              state (open modals, drag state, preview toggles) can leak across */}
          <EntitySettingsPanel
            key={activeType}
            entityType={activeType}
            config={config}
            onChange={updateSection}
            onReplaceConfig={updateConfig}
          />
        </div>
      </div>

      <div className="librarian-global-settings">
        <SettingsSection
          heading={intl.formatMessage({
            id: "librarian.settingsPage.formatting.heading",
          })}
        >
          <div className="content">
            <p className="librarian-token-hint text-muted">
              {intl.formatMessage({
                id: "librarian.settingsPage.formatting.hint",
              })}
            </p>
            <TextSettingModal
              heading={intl.formatMessage({
                id: "librarian.settingsPage.formatting.spaceReplacement.heading",
              })}
              subHeading={intl.formatMessage({
                id: "librarian.settingsPage.formatting.spaceReplacement.subHeading",
              })}
              value={config.sanitize && config.sanitize.spaceReplacement}
              onChange={(spaceReplacement: string) =>
                updateConfig({
                  ...config,
                  sanitize: { ...config.sanitize, spaceReplacement },
                })
              }
              placeholder={intl.formatMessage({
                id: "librarian.settingsPage.formatting.spaceReplacement.placeholder",
              })}
            />
            <TextSettingModal
              heading={intl.formatMessage({
                id: "librarian.settingsPage.formatting.performersDelimiter.heading",
              })}
              subHeading={
                <TokenizedText
                  text={intl.formatMessage({
                    id: "librarian.settingsPage.formatting.performersDelimiter.subHeading",
                  })}
                />
              }
              value={config.delimiters && config.delimiters.performers}
              onChange={(performers: string) =>
                updateConfig({
                  ...config,
                  delimiters: { ...config.delimiters, performers },
                })
              }
              placeholder={intl.formatMessage({
                id: "librarian.settingsPage.formatting.delimiterPlaceholder",
              })}
            />
            <TextSettingModal
              heading={intl.formatMessage({
                id: "librarian.settingsPage.formatting.tagsDelimiter.heading",
              })}
              subHeading={
                <TokenizedText
                  text={intl.formatMessage({
                    id: "librarian.settingsPage.formatting.tagsDelimiter.subHeading",
                  })}
                />
              }
              value={config.delimiters && config.delimiters.tags}
              onChange={(tags: string) =>
                updateConfig({
                  ...config,
                  delimiters: { ...config.delimiters, tags },
                })
              }
              placeholder={intl.formatMessage({
                id: "librarian.settingsPage.formatting.delimiterPlaceholder",
              })}
            />

            <div className="setting">
              <div>
                <h3>
                  {intl.formatMessage({
                    id: "librarian.settingsPage.formatting.reset.heading",
                  })}
                </h3>
                <div className="sub-heading">
                  {intl.formatMessage({
                    id: "librarian.settingsPage.formatting.reset.hint",
                  })}
                </div>
              </div>
              <div>
                <Button
                  variant="danger"
                  onClick={() => updateConfig(resetFormatting(config))}
                >
                  {intl.formatMessage({
                    id: "librarian.settingsPage.formatting.reset.button",
                  })}
                </Button>
              </div>
            </div>
          </div>
        </SettingsSection>
      </div>

      <div className="setting-section librarian-config-preview-section">
        <h1>
          {intl.formatMessage(
            { id: "librarian.settingsPage.preview.heading" },
            { entityNoun: countableNoun(intl, activeType) },
          )}
        </h1>
        <p className="librarian-token-hint text-muted">
          {intl.formatMessage(
            { id: "librarian.settingsPage.preview.hint" },
            { entityNoun: countableNoun(intl, activeType) },
          )}
        </p>
        {/* keyed like the settings panel so switching tabs cannot leave rows
            from another entity type on screen */}
        <ConfigPreviewPanel
          key={activeType}
          config={config}
          entityType={activeType}
        />
      </div>
    </div>
  );
}
