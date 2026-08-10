import React from "react";
import { ConditionsEditor } from "./ConditionsEditor.js";
import { LibraryRootPicker } from "./LibraryRootPicker.js";
import { PatternInput } from "./PatternInput.js";
import { SortCriteriaSelect } from "./SortCriteriaSelect.js";
import { StashBoxSelect } from "./StashBoxSelect.js";
import { RulePreviewPanel } from "./RulePreviewPanel.js";
import { TextSettingModal } from "./TextSettingModal.js";
import {
  ruleToPreviewFilter,
  stashIdGateIsApproximate,
} from "../../core/rule-to-filter.js";
import { useEntityCount } from "./useEntityCount.js";
import { adapterFor } from "../../core/entity-adapter.js";
import {
  patternUsesAnyToken,
  hasUnsafeOptionalOnlyBasename,
  patternsNeedStashIdDefault,
  PERFORMER_SORT_TOKENS,
  folderPatternMode,
  filenamePatternMode,
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
  entityType?: string;
  hasEarlierActiveRule: boolean;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function matchCountHeading(
  count: number | null,
  upperBound: boolean,
  noun: string,
  plural: string,
): string {
  if (count == null) {
    return capitalise(plural) + " currently matching this rule";
  }
  if (count === 1) {
    return upperBound
      ? "Up to 1 " + noun + " currently matches this rule"
      : "1 " + noun + " currently matches this rule";
  }
  return (
    (upperBound ? "Up to " : "") +
    count +
    " " +
    plural +
    " currently match this rule"
  );
}

export function RuleEditModal({
  rule,
  onChange,
  onClose,
  config,
  entityType,
  hasEarlierActiveRule,
}: RuleEditModalProps) {
  const type = entityType || "scenes";
  const adapter = adapterFor(type);
  // same reasoning as the default pattern: a keep-in-place rule ignores its root
  const keepsInPlace = folderPatternMode(rule.folderPattern) === "keep";
  const keepsName = filenamePatternMode(rule.filenamePattern) === "keep";
  // With several StashID sources accepted, Stash cannot filter on all of them
  // at once, so the query over-selects and the count is only an upper bound
  const gateApproximate = stashIdGateIsApproximate(config[type]);
  const countIsUpperBound = hasEarlierActiveRule || gateApproximate;
  const ruleFilter = ruleToPreviewFilter(rule, config[type]);
  const matchCount = useEntityCount(
    type,
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

          {keepsInPlace ? (
            <p className="librarian-token-hint text-muted">
              This rule's folder pattern is <code>{"{current}"}</code>, so
              matching {adapter.plural} keep the folder they are already in and
              no library root is needed. Give the folder pattern something else
              (or “/” for the library root itself) to move them into a library.
            </p>
          ) : (
            <LibraryRootPicker
              value={rule.libraryRoot || ""}
              entityType={entityType}
              subHeading="The root library path for which this rule is based"
              onChange={(libraryRoot) => onChange({ ...rule, libraryRoot })}
            />
          )}

          <PatternInput
            label="Folder pattern"
            isFolder
            entityType={entityType}
            subHeading="May contain “/” or “\\” for multiple nested folder levels. Use {current} to keep files in their current folder, or “/” to place them directly under the library root"
            value={rule.folderPattern}
            onChange={(folderPattern) => onChange({ ...rule, folderPattern })}
          />

          <PatternInput
            label="Filename pattern"
            entityType={entityType}
            subHeading={
              "The file name without the extension. Cannot contain < > : \" / \\ | ? * (stripped automatically if present). Use {current} to keep each file's current name and only move it"
            }
            value={rule.filenamePattern}
            onChange={(filenamePattern) =>
              onChange({ ...rule, filenamePattern })
            }
            validate={(v) => !hasUnsafeOptionalOnlyBasename(v)}
          />

          {/* Not an error: the first matching rule wins, so a rule that keeps
              both the folder and the name is a deliberate way to hold matches
              back from every later rule */}
          {keepsInPlace && keepsName && (
            <p className="librarian-token-hint text-muted">
              Both patterns are <code>{"{current}"}</code>, so matching{" "}
              {adapter.plural} are left exactly as they are, and no later rule
              or the default pattern gets to claim them. Change one of the two
              if you meant this rule to rename or move something.
            </p>
          )}

          {(patternUsesAnyToken(rule.folderPattern, PERFORMER_SORT_TOKENS) ||
            patternUsesAnyToken(
              rule.filenamePattern,
              PERFORMER_SORT_TOKENS,
            )) && (
            <div>
              Sort performers{" "}
              <SortCriteriaSelect
                value={rule.sortBy}
                onChange={(sortBy) => onChange({ ...rule, sortBy })}
              />
            </div>
          )}

          {type === "scenes" &&
            patternsNeedStashIdDefault([
              rule.folderPattern,
              rule.filenamePattern,
            ]) && (
              <div>
                Default StashID source{" "}
                <StashBoxSelect
                  value={rule.stashBoxEndpoint}
                  inheritedEndpoint={
                    config[type].defaultPattern &&
                    config[type].defaultPattern.stashBoxEndpoint
                  }
                  onChange={(stashBoxEndpoint) =>
                    onChange({ ...rule, stashBoxEndpoint })
                  }
                />
              </div>
            )}

          <ConditionsEditor
            entityType={type}
            value={{
              conditionLogic: rule.conditionLogic,
              conditions: rule.conditions,
            }}
            onChange={(next) => onChange({ ...rule, ...next })}
          />
        </div>

        <div className="librarian-rule-preview-section">
          <h4 className="filter-container text-muted paginationIndex center-text">
            {matchCountHeading(
              matchCount,
              countIsUpperBound,
              adapter.noun,
              adapter.plural,
            )}
          </h4>
          {countIsUpperBound && (
            <p className="librarian-token-hint text-muted">
              The preview below reflects what would actually happen to each{" "}
              {adapter.noun}, but the count above is only an upper bound:{" "}
              {[
                hasEarlierActiveRule &&
                  "an earlier rule may claim some of these first",
                gateApproximate &&
                  "more than one StashID source is accepted, which Stash cannot filter on all at once",
              ]
                .filter(Boolean)
                .join(", and ")}
            </p>
          )}
          <RulePreviewPanel rule={rule} config={config} entityType={type} />
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
