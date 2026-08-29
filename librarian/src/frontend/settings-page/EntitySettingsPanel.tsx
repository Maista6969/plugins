import React, { useState } from "react";
import { useIntl, IntlShape } from "react-intl";
import { RuleList } from "./RuleList.js";
import { PatternInput } from "./PatternInput.js";
import { LibraryRootPicker } from "./LibraryRootPicker.js";
import { ConditionsEditor } from "./ConditionsEditor.js";
import { SortCriteriaSelect } from "./SortCriteriaSelect.js";
import { StashBoxSelect } from "./StashBoxSelect.js";
import { StashBoxMultiSelect } from "./StashBoxMultiSelect.js";
import { SettingsSection } from "./SettingsSection.js";
import { ConfirmModal } from "../shared/ConfirmModal.js";
import { useEntityCount } from "./useEntityCount.js";
import { useStashBoxes } from "../shared/StashBoxesContext.js";
import { useLoadSelectComponents } from "../shared/useLoadSelectComponents.js";
import {
  ruleToPreviewFilter,
  stashIdGateIsApproximate,
} from "../../core/rule-to-filter.js";
import { countableNoun, capitalize } from "../shared/eligible-entities.js";
import { resetSection } from "../../core/config-schema.js";
import {
  patternUsesAnyToken,
  hasUnsafeOptionalOnlyBasename,
  patternsNeedStashIdDefault,
  PERFORMER_SORT_TOKENS,
  folderPatternMode,
  filenamePatternMode,
} from "../../core/path-template.js";

const PluginApi = (window as any).PluginApi;
const { Button } = PluginApi.libraries.Bootstrap;
const { faExclamationTriangle } = PluginApi.libraries.FontAwesomeSolid;

function excludeCountText(
  intl: IntlShape,
  count: number | null,
  entityType: string,
  upperBound: boolean,
): string | null {
  if (count == null) {
    return null;
  }
  return intl.formatMessage(
    { id: "librarian.entitySettingsPanel.excludeCount" },
    {
      count,
      upperBound: upperBound ? "true" : "false",
      noun: countableNoun(intl, entityType, false),
      plural: countableNoun(intl, entityType),
    },
  );
}

interface EntitySettingsPanelProps {
  entityType: string;
  config: any;
  onChange: (entityType: string, patch: any) => void;
  // a reset replaces the whole section rather than patching fields within it
  onReplaceConfig: (next: any) => void;
}

export function EntitySettingsPanel({
  entityType,
  config,
  onChange,
  onReplaceConfig,
}: EntitySettingsPanelProps) {
  const intl = useIntl();
  const [confirmingReset, setConfirmingReset] = useState(false);
  const { BooleanSetting, TagIDSelect } = PluginApi.components;
  const { stashBoxes } = useStashBoxes();
  useLoadSelectComponents(["tag"]);
  const section = config[entityType];
  const defaultPattern = section.defaultPattern || {};
  const noun = countableNoun(intl, entityType, false);
  const plural = countableNoun(intl, entityType);

  function update(patch: any) {
    onChange(entityType, patch);
  }

  function updateDefaultPattern(patch: any) {
    update({ defaultPattern: { ...defaultPattern, ...patch } });
  }

  // several accepted StashID sources make the gate over-select, so this count
  // is an upper bound rather than exact
  const excludeCountIsUpperBound = stashIdGateIsApproximate(section);
  const excludeFilter = ruleToPreviewFilter(section.excludeConditions, section);
  const excludeCount = useEntityCount(
    entityType,
    excludeFilter === null ? undefined : excludeFilter,
  );

  // Only zip galleries can be renamed at all, so show how many would be skipped
  const folderGalleryCount = useEntityCount(
    "galleries",
    entityType === "galleries" ? { is_zip: false } : undefined,
  );

  // A folder pattern of {current} keeps files in their own folder, so the
  // library root has no effect. Hide the picker rather than letting it be set
  // and ignored.
  const keepsInPlace =
    folderPatternMode(defaultPattern.folderPattern) === "keep";
  // Blank on both sides is a no-op the planner reports as skipped, which is only
  // obvious once you have run it. Say so here instead
  const keepsName =
    filenamePatternMode(defaultPattern.filenamePattern) === "keep";

  // only when some {stash_id} still has no |from= of its own, so a pattern that
  // names every source itself does not show a picker nothing would consult
  const usesStashId = patternsNeedStashIdDefault([
    defaultPattern.folderPattern,
    defaultPattern.filenamePattern,
  ]);
  const usesPerformerSort =
    patternUsesAnyToken(defaultPattern.folderPattern, PERFORMER_SORT_TOKENS) ||
    patternUsesAnyToken(defaultPattern.filenamePattern, PERFORMER_SORT_TOKENS);

  return (
    <div className="librarian-entity-settings">
      <SettingsSection
        heading={intl.formatMessage({
          id: "librarian.entitySettingsPanel.options.heading",
        })}
      >
        <BooleanSetting
          id={"librarian-auto-rename-" + entityType}
          heading={intl.formatMessage({
            id: "librarian.entitySettingsPanel.autoRename.heading",
          })}
          subHeading={intl.formatMessage(
            { id: "librarian.entitySettingsPanel.autoRename.subHeading" },
            { entityNoun: noun },
          )}
          checked={!!section.autoRename}
          onChange={(v: boolean) => update({ autoRename: v })}
        />
        <BooleanSetting
          id={"librarian-only-organized-" + entityType}
          heading={intl.formatMessage(
            { id: "librarian.entitySettingsPanel.onlyOrganized.heading" },
            {
              entityNoun: plural,
              organized: intl.formatMessage({ id: "organized" }).toLowerCase(),
            },
          )}
          subHeading={intl.formatMessage(
            { id: "librarian.entitySettingsPanel.onlyOrganized.subHeading" },
            { entityNoun: plural },
          )}
          checked={!!section.onlyOrganized}
          onChange={(v: boolean) => update({ onlyOrganized: v })}
        />
        <div className="setting">
          <div>
            <h3>
              {intl.formatMessage({
                id: "librarian.entitySettingsPanel.tagBlacklist.heading",
              })}
            </h3>
            <div className="sub-heading">
              {intl.formatMessage({
                id: "librarian.entitySettingsPanel.tagBlacklist.subHeading",
              })}
            </div>
          </div>
          <div className="librarian-tag-blacklist-select">
            {TagIDSelect && (
              <TagIDSelect
                ids={section.tagBlacklist || []}
                isMulti
                menuPortalTarget={document.body}
                onSelect={(items: { id: string }[]) =>
                  update({ tagBlacklist: items.map((i) => String(i.id)) })
                }
              />
            )}
          </div>
        </div>
        {/* Only scenes have stash_ids */}
        {entityType === "scenes" && (
          <div className="setting-group">
            <BooleanSetting
              id="librarian-only-with-stash-id"
              heading={intl.formatMessage({
                id: "librarian.entitySettingsPanel.onlyWithStashId.heading",
              })}
              subHeading={intl.formatMessage({
                id: "librarian.entitySettingsPanel.onlyWithStashId.subHeading",
              })}
              checked={!!section.onlyWithStashId}
              onChange={(v: boolean) => update({ onlyWithStashId: v })}
            />
            {/* Only worth choosing between sources when more than one is configured */}
            {section.onlyWithStashId && stashBoxes.length > 1 && (
              <div className="setting">
                <div>
                  <h3>
                    {intl.formatMessage({
                      id: "librarian.entitySettingsPanel.acceptedSources.heading",
                    })}
                  </h3>
                  <div className="sub-heading">
                    {intl.formatMessage({
                      id: "librarian.entitySettingsPanel.acceptedSources.subHeading",
                    })}
                  </div>
                </div>
                <div>
                  <StashBoxMultiSelect
                    value={section.stashIdEndpoints}
                    onChange={(stashIdEndpoints: string[]) =>
                      update({ stashIdEndpoints })
                    }
                  />
                </div>
              </div>
            )}
          </div>
        )}
        <div className="setting">
          <div>
            <h3>
              {intl.formatMessage(
                { id: "librarian.entitySettingsPanel.resetSection.heading" },
                { entityNoun: plural },
              )}
            </h3>
            <div className="sub-heading">
              {intl.formatMessage({
                id: "librarian.entitySettingsPanel.resetSection.subHeading",
              })}
            </div>
          </div>
          <div>
            <Button variant="danger" onClick={() => setConfirmingReset(true)}>
              {intl.formatMessage({
                id: "librarian.settingsPage.formatting.reset.button",
              })}
            </Button>
          </div>
        </div>
      </SettingsSection>

      {confirmingReset && (
        <ConfirmModal
          show
          icon={faExclamationTriangle}
          header={intl.formatMessage(
            { id: "librarian.entitySettingsPanel.confirmReset.header" },
            { entityNoun: plural },
          )}
          cancel={{
            text: intl.formatMessage({ id: "actions.cancel" }),
            onClick: () => setConfirmingReset(false),
          }}
          accept={{
            text: intl.formatMessage(
              { id: "librarian.entitySettingsPanel.confirmReset.accept" },
              { entityNoun: plural },
            ),
            variant: "danger",
            onClick: () => {
              setConfirmingReset(false);
              onReplaceConfig(resetSection(config, entityType));
            },
          }}
        >
          <p>
            {intl.formatMessage({
              id: "librarian.entitySettingsPanel.confirmReset.bodyBefore",
            })}{" "}
            <strong>{plural}</strong>
            {intl.formatMessage({
              id: "librarian.entitySettingsPanel.confirmReset.bodyAfter",
            })}
          </p>
          <p>
            {section.rules && section.rules.length > 0
              ? intl.formatMessage(
                  {
                    id: "librarian.entitySettingsPanel.confirmReset.rulesKept",
                  },
                  { count: section.rules.length },
                )
              : null}
          </p>
          <p>
            {intl.formatMessage({
              id: "librarian.entitySettingsPanel.confirmReset.otherTabs",
            })}
          </p>
        </ConfirmModal>
      )}

      <SettingsSection
        heading={intl.formatMessage({
          id: "librarian.entitySettingsPanel.exclusions.heading",
        })}
      >
        <div className="content">
          <p className="librarian-token-hint text-muted">
            {intl.formatMessage(
              { id: "librarian.entitySettingsPanel.exclusions.hint" },
              { entityNoun: capitalize(plural) },
            )}
          </p>
          <ConditionsEditor
            entityType={entityType}
            value={section.excludeConditions}
            onChange={(excludeConditions) => update({ excludeConditions })}
          />
          {/* rendered even while the debounced count is in flight, so its
              arrival cannot push the rest of the form down */}
          <p className="librarian-token-hint text-muted librarian-count-line">
            {excludeCountText(
              intl,
              excludeCount,
              entityType,
              excludeCountIsUpperBound,
            ) || " "}
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        heading={intl.formatMessage({
          id: "librarian.entitySettingsPanel.rules.heading",
        })}
      >
        <div className="content">
          <RuleList
            rules={section.rules}
            onChange={(rules) => update({ rules })}
            config={config}
            entityType={entityType}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        heading={intl.formatMessage({
          id: "librarian.entitySettingsPanel.defaultPattern.heading",
        })}
      >
        <div className="content">
          <p className="librarian-token-hint text-muted">
            {intl.formatMessage(
              { id: "librarian.entitySettingsPanel.defaultPattern.hint" },
              { entityNoun: noun },
            )}
          </p>
          {keepsInPlace ? (
            <p className="librarian-token-hint text-muted">
              {intl.formatMessage({
                id: "librarian.entitySettingsPanel.keepsInPlace.before",
              })}{" "}
              <code>{"{current}"}</code>
              {intl.formatMessage(
                { id: "librarian.entitySettingsPanel.keepsInPlace.after" },
                { noun, plural },
              )}
            </p>
          ) : (
            <LibraryRootPicker
              value={defaultPattern.libraryRoot}
              entityType={entityType}
              subHeading={intl.formatMessage(
                { id: "librarian.entitySettingsPanel.libraryRoot.subHeading" },
                { entityNoun: plural },
              )}
              onChange={(libraryRoot: string) =>
                updateDefaultPattern({ libraryRoot })
              }
            />
          )}

          <PatternInput
            label={intl.formatMessage({
              id: "librarian.ruleEditModal.folderPattern.label",
            })}
            isFolder
            entityType={entityType}
            subHeading={intl.formatMessage({
              id: "librarian.entitySettingsPanel.folderPattern.subHeading",
            })}
            value={defaultPattern.folderPattern}
            onChange={(folderPattern: string) =>
              updateDefaultPattern({ folderPattern })
            }
          />

          <PatternInput
            label={intl.formatMessage({
              id: "librarian.ruleEditModal.filenamePattern.label",
            })}
            entityType={entityType}
            subHeading={intl.formatMessage({
              id: "librarian.entitySettingsPanel.filenamePattern.subHeading",
            })}
            value={defaultPattern.filenamePattern}
            onChange={(filenamePattern: string) =>
              updateDefaultPattern({ filenamePattern })
            }
            validate={(v) => !hasUnsafeOptionalOnlyBasename(v)}
          />

          {keepsInPlace && keepsName && (
            <p className="librarian-token-hint text-warning">
              {intl.formatMessage({
                id: "librarian.entitySettingsPanel.keepsBoth.before",
              })}{" "}
              <code>{"{current}"}</code>
              {intl.formatMessage(
                { id: "librarian.entitySettingsPanel.keepsBoth.after" },
                { entityNoun: noun },
              )}
            </p>
          )}

          {usesPerformerSort && (
            <div>
              {intl.formatMessage({
                id: "librarian.ruleEditModal.sortPerformers",
              })}{" "}
              <SortCriteriaSelect
                value={defaultPattern.sortBy}
                onChange={(sortBy: string[]) =>
                  updateDefaultPattern({ sortBy })
                }
              />
            </div>
          )}

          {entityType === "scenes" && usesStashId && (
            <div>
              {intl.formatMessage({
                id: "librarian.ruleEditModal.defaultStashIdSource",
              })}{" "}
              <StashBoxSelect
                value={defaultPattern.stashBoxEndpoint}
                onChange={(stashBoxEndpoint: string) =>
                  updateDefaultPattern({ stashBoxEndpoint })
                }
              />
            </div>
          )}
        </div>
      </SettingsSection>

      {entityType === "galleries" && (
        <div className="librarian-entity-notice">
          <p className="librarian-token-hint text-warning">
            {intl.formatMessage({
              id: "librarian.entitySettingsPanel.galleries.zipOnlyBefore",
            })}{" "}
            <strong>
              {intl.formatMessage({
                id: "librarian.entitySettingsPanel.galleries.zipGalleries",
              })}
            </strong>{" "}
            {intl.formatMessage({
              id: "librarian.entitySettingsPanel.galleries.zipOnlyAfter",
            })}
          </p>
          {folderGalleryCount != null && folderGalleryCount > 0 && (
            <p className="librarian-token-hint text-muted">
              {intl.formatMessage(
                {
                  id: "librarian.entitySettingsPanel.galleries.folderBasedCount",
                },
                { count: folderGalleryCount },
              )}
            </p>
          )}
        </div>
      )}

      {entityType === "images" && (
        <div className="librarian-entity-notice">
          <p className="librarian-token-hint text-warning">
            {intl.formatMessage({
              id: "librarian.entitySettingsPanel.images.zipSkipped",
            })}
          </p>
        </div>
      )}
    </div>
  );
}
