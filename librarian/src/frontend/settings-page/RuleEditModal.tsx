import React from "react";
import { ConditionsEditor } from "./ConditionsEditor.js";
import { LibraryRootPicker } from "./LibraryRootPicker.js";
import { PatternInput } from "./PatternInput.js";
import { SortBySelect } from "./SortBySelect.js";
import { StashBoxSelect } from "./StashBoxSelect.js";
import { RulePreviewPanel } from "./RulePreviewPanel.js";
import { TextSettingModal } from "./TextSettingModal.js";
import { ruleToPreviewFilter } from "../../core/rule-to-filter.js";
import { useSceneCount } from "./useSceneCount.js";
import {
  patternUsesAnyToken,
  hasUnsafeOptionalOnlyBasename,
  PERFORMER_SORT_TOKENS,
} from "../../core/path-template.js";
import type { Rule } from "./RuleEditor.js";

const PluginApi = (window as any).PluginApi;
const { Modal, Button } = PluginApi.libraries.Bootstrap;
const { faCog } = PluginApi.libraries.FontAwesomeSolid;
const Icon = PluginApi.components.Icon;

interface RuleEditModalProps {
  rule: Rule;
  onChange: (next: Rule) => void;
  onClose: () => void;
  config: any;
  hasEarlierActiveRule: boolean;
}

function matchCountHeading(count: number | null, upperBound: boolean): string {
  if (count == null) {
    return "Scenes currently matching this rule";
  }
  if (count === 1) {
    return upperBound
      ? "Up to 1 scene currently matches this rule"
      : "1 scene currently matches this rule";
  }
  return (
    (upperBound ? "Up to " : "") + count + " scenes currently match this rule"
  );
}

export function RuleEditModal({
  rule,
  onChange,
  onClose,
  config,
  hasEarlierActiveRule,
}: RuleEditModalProps) {
  const ruleFilter = ruleToPreviewFilter(rule, config);
  const matchCount = useSceneCount(
    ruleFilter === null ? undefined : ruleFilter,
  );

  return (
    <Modal
      className="ModalComponent"
      keyboard={false}
      show
      onHide={onClose}
      size="xl"
    >
      <Modal.Header>
        <Icon icon={faCog} />
        <span>{rule.name || "Unnamed rule"}</span>
      </Modal.Header>
      <Modal.Body>
        <div className="setting-section">
          <TextSettingModal
            heading="Rule name"
            subHeading="Make it easier to remember why this rule exists by giving it a good name"
            value={rule.name}
            onChange={(name) => onChange({ ...rule, name })}
            placeholder="e.g. OnlyFans performers"
          />

          <LibraryRootPicker
            value={rule.libraryRoot || ""}
            subHeading="The root library path for which this rule is based"
            onChange={(libraryRoot) => onChange({ ...rule, libraryRoot })}
          />

          <PatternInput
            label="Folder pattern"
            subHeading="May contain “/” or “\\” for multiple nested folder levels. Leave blank to place files directly under the library root"
            value={rule.folderPattern}
            onChange={(folderPattern) => onChange({ ...rule, folderPattern })}
          />

          <PatternInput
            label="Filename pattern"
            subHeading={
              'The file name without the extension. Cannot contain < > : " / \\ | ? * (stripped automatically if present)'
            }
            value={rule.filenamePattern}
            onChange={(filenamePattern) =>
              onChange({ ...rule, filenamePattern })
            }
            validate={(v) => !hasUnsafeOptionalOnlyBasename(v)}
          />

          <ConditionsEditor
            value={{
              conditionLogic: rule.conditionLogic,
              conditions: rule.conditions,
            }}
            onChange={(next) => onChange({ ...rule, ...next })}
          />

          {(patternUsesAnyToken(rule.folderPattern, PERFORMER_SORT_TOKENS) ||
            patternUsesAnyToken(
              rule.filenamePattern,
              PERFORMER_SORT_TOKENS,
            )) && (
            <div>
              Sort performers{" "}
              <SortBySelect
                value={rule.sortBy}
                onChange={(sortBy) => onChange({ ...rule, sortBy })}
              />
            </div>
          )}

          {(patternUsesAnyToken(rule.folderPattern, ["stash_id"]) ||
            patternUsesAnyToken(rule.filenamePattern, ["stash_id"])) && (
            <div>
              StashID source{" "}
              <StashBoxSelect
                value={rule.stashBoxEndpoint}
                inheritedEndpoint={
                  config.defaultPattern && config.defaultPattern.stashBoxEndpoint
                }
                onChange={(stashBoxEndpoint) =>
                  onChange({ ...rule, stashBoxEndpoint })
                }
              />
            </div>
          )}
        </div>

        <div className="librarian-rule-preview-section">
          <h4 className="filter-container text-muted paginationIndex center-text">
            {matchCountHeading(matchCount, hasEarlierActiveRule)}
          </h4>
          {hasEarlierActiveRule && (
            <p className="librarian-token-hint text-muted">
              An earlier rule may claim some of these first; the preview below
              reflects what would actually happen to each scene, but this count
              doesn't account for rule order
            </p>
          )}
          <RulePreviewPanel rule={rule} config={config} />
        </div>
      </Modal.Body>
      <Modal.Footer className="ModalFooter">
        <div />
        <div>
          <Button variant="primary" className="ml-2" onClick={onClose}>
            Close
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
