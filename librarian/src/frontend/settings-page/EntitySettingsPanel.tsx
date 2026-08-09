import React, { useState } from "react";
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
import {
  ruleToPreviewFilter,
  stashIdGateIsApproximate,
} from "../../core/rule-to-filter.js";
import { adapterFor } from "../../core/entity-adapter.js";
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

function countText(
  count: number | null,
  plural: string,
  upperBound: boolean,
): string | null {
  if (count == null) {
    return null;
  }
  const noun =
    count === 1
      ? plural.replace(/(ie)?s$/, (m) => (m === "ies" ? "y" : ""))
      : plural;
  return (
    (upperBound ? "Up to " : "") +
    count +
    " " +
    noun +
    (count === 1 ? " currently matches" : " currently match") +
    " these exclusion conditions"
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
  const [confirmingReset, setConfirmingReset] = useState(false);
  const { BooleanSetting } = PluginApi.components;
  const adapter = adapterFor(entityType);
  const { stashBoxes } = useStashBoxes();
  const section = config[entityType];
  const defaultPattern = section.defaultPattern || {};
  const noun = adapter.noun;
  const plural = adapter.plural;

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

  // A blank folder pattern keeps files in their own folder, so the library root
  // has no effect. Hide the picker rather than letting it be set and ignored.
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
      <SettingsSection heading="Options">
        <BooleanSetting
          id={"librarian-auto-rename-" + entityType}
          heading="Automatic renaming"
          subHeading={"Run the plugin on every " + noun + " update"}
          checked={!!section.autoRename}
          onChange={(v: boolean) => update({ autoRename: v })}
        />
        <BooleanSetting
          id={"librarian-only-organized-" + entityType}
          heading={"Only rename " + plural + " marked Organized"}
          subHeading={
            "Avoids modifying " + plural + " you haven't reviewed yet"
          }
          checked={!!section.onlyOrganized}
          onChange={(v: boolean) => update({ onlyOrganized: v })}
        />
        {/* Only scenes have stash_ids */}
        {entityType === "scenes" && (
          <div className="setting-group">
            <BooleanSetting
              id="librarian-only-with-stash-id"
              heading="Only rename scenes with at least one StashID"
              subHeading="Avoids modifying scenes have not been matched against a stash-box"
              checked={!!section.onlyWithStashId}
              onChange={(v: boolean) => update({ onlyWithStashId: v })}
            />
            {/* Only worth choosing between sources when more than one is configured */}
            {section.onlyWithStashId && stashBoxes.length > 1 && (
              <div className="setting">
                <div>
                  <h3>Accepted sources</h3>
                  <div className="sub-heading">
                    Leave empty to accept a StashID from any stash-box
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
            <h3>Reset {plural} settings</h3>
            <div className="sub-heading">
              Reset this tab to its default settings
            </div>
          </div>
          <div>
            <Button variant="danger" onClick={() => setConfirmingReset(true)}>
              Reset
            </Button>
          </div>
        </div>
      </SettingsSection>

      {confirmingReset && (
        <ConfirmModal
          show
          icon={faExclamationTriangle}
          header={"Reset " + plural + " settings?"}
          cancel={{ text: "Cancel", onClick: () => setConfirmingReset(false) }}
          accept={{
            text: "Reset " + plural,
            variant: "danger",
            onClick: () => {
              setConfirmingReset(false);
              onReplaceConfig(resetSection(config, entityType));
            },
          }}
        >
          <p>
            The options, exclusions and default pattern on the{" "}
            <strong>{adapter.label}</strong> tab go back to their defaults. This
            takes effect immediately and cannot be undone.
          </p>
          <p>
            {section.rules && section.rules.length > 0
              ? "Your " +
                section.rules.length +
                (section.rules.length === 1 ? " rule is" : " rules are") +
                " kept, but switched off, so nothing you wrote is lost. Turn any of them back on when you want it again."
              : null}
          </p>
          <p>Settings on the other tabs are not affected.</p>
        </ConfirmModal>
      )}

      <SettingsSection heading="Exclusions">
        <div className="content">
          <p className="librarian-token-hint text-muted">
            {plural.charAt(0).toUpperCase() + plural.slice(1)} that match these
            conditions will always be skipped regardless of what other rules
            they would match
          </p>
          <ConditionsEditor
            entityType={entityType}
            value={section.excludeConditions}
            onChange={(excludeConditions) => update({ excludeConditions })}
          />
          {/* rendered even while the debounced count is in flight, so its
              arrival cannot push the rest of the form down */}
          <p className="librarian-token-hint text-muted librarian-count-line">
            {countText(excludeCount, plural, excludeCountIsUpperBound) || " "}
          </p>
        </div>
      </SettingsSection>

      <SettingsSection heading="Rules">
        <div className="content">
          <RuleList
            rules={section.rules}
            onChange={(rules) => update({ rules })}
            config={config}
            entityType={entityType}
          />
        </div>
      </SettingsSection>

      <SettingsSection heading="Default pattern">
        <div className="content">
          <p className="librarian-token-hint text-muted">
            Will be used for every {noun} unless they have a more specific rule
            above
          </p>
          {keepsInPlace ? (
            <p className="librarian-token-hint text-muted">
              The folder pattern below is blank, so each {noun} keeps the folder
              it is already in and no library root is needed. Give the folder
              pattern a value (or “/” for the library root itself) to move{" "}
              {plural} into a library.
            </p>
          ) : (
            <LibraryRootPicker
              value={defaultPattern.libraryRoot}
              entityType={entityType}
              subHeading={
                "The library that " + plural + " end up in by default"
              }
              onChange={(libraryRoot: string) =>
                updateDefaultPattern({ libraryRoot })
              }
            />
          )}

          <PatternInput
            label="Folder pattern"
            isFolder
            entityType={entityType}
            subHeading="Always active when no rule matches. May contain “/” or “\\” for multiple nested folder levels. Leave blank to keep files in their current folder, or use “/” to place them directly under the library root"
            value={defaultPattern.folderPattern}
            onChange={(folderPattern: string) =>
              updateDefaultPattern({ folderPattern })
            }
          />

          <PatternInput
            label="Filename pattern"
            entityType={entityType}
            subHeading="The file's whole name, never split into subfolders, even if a token's value happens to contain “/” or “\\”. Leave blank to keep each file's current name and only move it"
            value={defaultPattern.filenamePattern}
            onChange={(filenamePattern: string) =>
              updateDefaultPattern({ filenamePattern })
            }
            validate={(v) => !hasUnsafeOptionalOnlyBasename(v)}
          />

          {keepsInPlace && keepsName && (
            <p className="librarian-token-hint text-warning">
              Both patterns are blank, so nothing would happen: every {noun}{" "}
              would keep the folder and the name it already has, and be reported
              as skipped. Give one of the two a value to activate this rule
            </p>
          )}

          {usesPerformerSort && (
            <div>
              Sort performers{" "}
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
              Default StashID source{" "}
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
            Only <strong>zip galleries</strong> can be renamed
          </p>
          {folderGalleryCount != null && folderGalleryCount > 0 && (
            <p className="librarian-token-hint text-muted">
              {folderGalleryCount === 1
                ? "1 gallery in your library is folder-based and will be skipped"
                : folderGalleryCount +
                  " galleries in your library are folder-based and will be skipped"}
            </p>
          )}
        </div>
      )}

      {entityType === "images" && (
        <div className="librarian-entity-notice">
          <p className="librarian-token-hint text-warning">
            Images inside a zip gallery are always skipped
          </p>
        </div>
      )}
    </div>
  );
}
