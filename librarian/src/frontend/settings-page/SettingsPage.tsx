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
  collectEntityIds,
  pruneDeadEntities,
} from "../../core/prune-dead-entities.js";
import { pruneDeadLibraryRoots } from "../../core/prune-dead-library-roots.js";
import { RuleList } from "./RuleList.js";
import { PatternInput } from "./PatternInput.js";
import { TextSettingModal } from "./TextSettingModal.js";
import { LibraryRootPicker } from "./LibraryRootPicker.js";
import { ConfigPreviewPanel } from "./ConfigPreviewPanel.js";
import { ConditionsEditor } from "./ConditionsEditor.js";
import { SortBySelect } from "./SortBySelect.js";
import { StashBoxSelect } from "./StashBoxSelect.js";
import { SettingsSection } from "./SettingsSection.js";
import { LibraryPathsProvider } from "../shared/LibraryPathsContext.js";
import { StashBoxesProvider } from "../shared/StashBoxesContext.js";
import { TokenizedText } from "../shared/TokenizedText.js";
import { useLoadSettingsComponents } from "../shared/useLoadSettingsComponents.js";
import { usePluginPageTitle } from "./usePluginPageTitle.js";
import { useSceneCount } from "./useSceneCount.js";
import { ruleToPreviewFilter } from "../../core/rule-to-filter.js";
import {
  patternUsesAnyToken,
  hasUnsafeOptionalOnlyBasename,
  PERFORMER_SORT_TOKENS,
} from "../../core/path-template.js";

const PluginApi = (window as any).PluginApi;
const { Spinner } = PluginApi.libraries.Bootstrap;
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

function excludeCountText(count: number | null): string | null {
  if (count == null) {
    return null;
  }
  if (count === 1) {
    return "1 scene currently matches these exclusion conditions";
  }
  return count + " scenes currently match these exclusion conditions";
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
  const [updateSuccess, setUpdateSuccess] = useState<boolean | undefined>(
    undefined,
  );
  const successTimerRef = useRef<any>(null);
  const Toast = PluginApi.hooks.useToast();
  const pluginName = usePluginPageTitle();

  const loadingSettingsComponents = useLoadSettingsComponents();
  const { BooleanSetting } = PluginApi.components;

  const excludeFilter = config
    ? ruleToPreviewFilter(config.excludeConditions, config)
    : null;
  const excludeCount = useSceneCount(
    excludeFilter === null ? undefined : excludeFilter,
  );

  useEffect(() => {
    let cancelled = false;
    getConfiguration(client).then(async (cfg) => {
      let effectiveConfig = cfg;
      try {
        const referencedIds = collectEntityIds(cfg);
        const deadIds = await findDeadEntityIds(client, referencedIds);
        const pruned = pruneDeadEntities(effectiveConfig, deadIds);
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
        const prunedRoots = pruneDeadLibraryRoots(effectiveConfig, validPaths);
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

      <SettingsSection heading="Options">
        <BooleanSetting
          id="librarian-auto-rename"
          heading="Automatic renaming"
          subHeading="Run the plugin on every scene update"
          checked={!!config.autoRename}
          onChange={(v: boolean) => updateConfig({ ...config, autoRename: v })}
        />
        <BooleanSetting
          id="librarian-only-organized"
          heading="Only rename scenes marked Organized"
          subHeading="Avoids modifying scenes you haven't reviewed yet"
          checked={!!config.onlyOrganized}
          onChange={(v: boolean) =>
            updateConfig({ ...config, onlyOrganized: v })
          }
        />
        <BooleanSetting
          id="librarian-only-with-stash-id"
          heading="Only rename scenes with at least one StashID"
          subHeading="Avoids modifying scenes have not been matched against a stash-box"
          checked={!!config.onlyWithStashId}
          onChange={(v: boolean) =>
            updateConfig({ ...config, onlyWithStashId: v })
          }
        />
      </SettingsSection>

      <SettingsSection heading="Exclusions">
        <div className="content">
          <p className="librarian-token-hint text-muted">
            Scenes that match these conditions will always be skipped regardless
            of what other rules they would match
          </p>
          <ConditionsEditor
            value={config.excludeConditions}
            onChange={(excludeConditions) =>
              updateConfig({ ...config, excludeConditions })
            }
          />
          {excludeCountText(excludeCount) && (
            <p className="librarian-token-hint text-muted">
              {excludeCountText(excludeCount)}
            </p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection heading="Rules">
        <div className="content">
          <RuleList
            rules={config.rules}
            onChange={(rules) => updateConfig({ ...config, rules })}
            config={config}
          />
        </div>
      </SettingsSection>

      <SettingsSection heading="Formatting">
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

      <SettingsSection heading="Default pattern">
        <div className="content">
          <p className="librarian-token-hint text-muted">
            Will be used for every scene unless they have a more specific rule
            above
          </p>
          <LibraryRootPicker
            value={config.defaultPattern.libraryRoot}
            subHeading="The library that files end up in by default"
            onChange={(libraryRoot: string) =>
              updateConfig({
                ...config,
                defaultPattern: { ...config.defaultPattern, libraryRoot },
              })
            }
          />

          <PatternInput
            label="Folder pattern"
            subHeading="Always active when no rule matches. May contain “/” for multiple nested folder levels. Leave blank to place files directly under the library root"
            value={config.defaultPattern.folderPattern}
            onChange={(folderPattern: string) =>
              updateConfig({
                ...config,
                defaultPattern: { ...config.defaultPattern, folderPattern },
              })
            }
          />

          <PatternInput
            label="Filename pattern"
            subHeading="The file's whole name, never split into subfolders, even if a token's value happens to contain “/”"
            value={config.defaultPattern.filenamePattern}
            onChange={(filenamePattern: string) =>
              updateConfig({
                ...config,
                defaultPattern: { ...config.defaultPattern, filenamePattern },
              })
            }
            validate={(v) => !hasUnsafeOptionalOnlyBasename(v)}
          />

          {(patternUsesAnyToken(
            config.defaultPattern.folderPattern,
            PERFORMER_SORT_TOKENS,
          ) ||
            patternUsesAnyToken(
              config.defaultPattern.filenamePattern,
              PERFORMER_SORT_TOKENS,
            )) && (
            <div>
              Sort performers{" "}
              <SortBySelect
                value={config.defaultPattern.sortBy}
                onChange={(sortBy: string) =>
                  updateConfig({
                    ...config,
                    defaultPattern: { ...config.defaultPattern, sortBy },
                  })
                }
              />
            </div>
          )}

          {(patternUsesAnyToken(config.defaultPattern.folderPattern, [
            "stash_id",
          ]) ||
            patternUsesAnyToken(config.defaultPattern.filenamePattern, [
              "stash_id",
            ])) && (
            <div>
              StashID source{" "}
              <StashBoxSelect
                value={config.defaultPattern.stashBoxEndpoint}
                onChange={(stashBoxEndpoint: string) =>
                  updateConfig({
                    ...config,
                    defaultPattern: {
                      ...config.defaultPattern,
                      stashBoxEndpoint,
                    },
                  })
                }
              />
            </div>
          )}
        </div>
      </SettingsSection>

      <div className="setting-section librarian-config-preview-section">
        <h1>Preview</h1>
        <p className="librarian-token-hint text-muted">
          Shows what the current rules would do to a sample of recent scenes
        </p>
        <ConfigPreviewPanel config={config} />
      </div>
    </div>
  );
}
