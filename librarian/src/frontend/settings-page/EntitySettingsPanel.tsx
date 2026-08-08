import React from "react";
import { RuleList } from "./RuleList.js";
import { PatternInput } from "./PatternInput.js";
import { LibraryRootPicker } from "./LibraryRootPicker.js";
import { ConditionsEditor } from "./ConditionsEditor.js";
import { SortBySelect } from "./SortBySelect.js";
import { StashBoxSelect } from "./StashBoxSelect.js";
import { StashBoxMultiSelect } from "./StashBoxMultiSelect.js";
import { SettingsSection } from "./SettingsSection.js";
import { useEntityCount } from "./useEntityCount.js";
import { useStashBoxes } from "../shared/StashBoxesContext.js";
import { ruleToPreviewFilter } from "../../core/rule-to-filter.js";
import { adapterFor } from "../../core/entity-adapter.js";
import {
  patternUsesAnyToken,
  hasUnsafeOptionalOnlyBasename,
  PERFORMER_SORT_TOKENS,
  folderPatternMode,
} from "../../core/path-template.js";

const PluginApi = (window as any).PluginApi;

function countText(count: number | null, plural: string): string | null {
  if (count == null) {
    return null;
  }
  const noun =
    count === 1
      ? plural.replace(/(ie)?s$/, (m) => (m === "ies" ? "y" : ""))
      : plural;
  return (
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
}

export function EntitySettingsPanel({
  entityType,
  config,
  onChange,
}: EntitySettingsPanelProps) {
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

  const usesStashId =
    patternUsesAnyToken(defaultPattern.folderPattern, ["stash_id"]) ||
    patternUsesAnyToken(defaultPattern.filenamePattern, ["stash_id"]);
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
      </SettingsSection>

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
            {countText(excludeCount, plural) || " "}
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
              subHeading={"The library that " + plural + " end up in by default"}
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
            subHeading="The file's whole name, never split into subfolders, even if a token's value happens to contain “/” or “\\”"
            value={defaultPattern.filenamePattern}
            onChange={(filenamePattern: string) =>
              updateDefaultPattern({ filenamePattern })
            }
            validate={(v) => !hasUnsafeOptionalOnlyBasename(v)}
          />

          {usesPerformerSort && (
            <div>
              Sort performers{" "}
              <SortBySelect
                value={defaultPattern.sortBy}
                onChange={(sortBy: string) => updateDefaultPattern({ sortBy })}
              />
            </div>
          )}

          {entityType === "scenes" && usesStashId && (
            <div>
              StashID source{" "}
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
            Only <strong>zip galleries</strong> can be renamed. Stash has no way
            to move or rename a gallery folder, and moving a folder gallery's
            images one by one would leave the gallery, along with its title,
            date, rating and tags, behind on the old folder while a new empty
            gallery appeared at the new one. Folder-based galleries are
            therefore always skipped.
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
            Images inside a zip gallery are always skipped: Stash refuses to
            move or rename anything contained in a zip, even to change only the
            filename. Rename the gallery itself instead.
          </p>
        </div>
      )}
    </div>
  );
}
