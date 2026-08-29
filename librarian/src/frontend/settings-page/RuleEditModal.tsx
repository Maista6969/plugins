import React from "react";
import { useIntl, IntlShape } from "react-intl";
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
  ruleFilterIsApproximate,
} from "../../core/rule-to-filter.js";
import { useEntityCount } from "./useEntityCount.js";
import { countableNoun } from "../shared/eligible-entities.js";
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

function matchCountHeading(
  intl: IntlShape,
  count: number | null,
  upperBound: boolean,
  entityType: string,
): string {
  if (count == null) {
    return intl.formatMessage(
      { id: "librarian.ruleEditModal.matchHeading.unknown" },
      { entityNoun: countableNoun(intl, entityType, true, true) },
    );
  }
  return intl.formatMessage(
    { id: "librarian.ruleEditModal.matchHeading.counted" },
    {
      count,
      upperBound: upperBound ? "true" : "false",
      noun: countableNoun(intl, entityType, false),
      plural: countableNoun(intl, entityType),
    },
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
  const intl = useIntl();
  const type = entityType || "scenes";
  // same reasoning as the default pattern: a keep-in-place rule ignores its root
  const keepsInPlace = folderPatternMode(rule.folderPattern) === "keep";
  const keepsName = filenamePatternMode(rule.filenamePattern) === "keep";
  // With several StashID sources accepted, Stash cannot filter on all of them
  // at once, so the query over-selects and the count is only an upper bound
  const gateApproximate = stashIdGateIsApproximate(config[type]);
  const quantifierApproximate = ruleFilterIsApproximate(rule);
  const countIsUpperBound =
    hasEarlierActiveRule || gateApproximate || quantifierApproximate;
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
        <span>
          {rule.name ||
            intl.formatMessage({ id: "librarian.ruleEditor.unnamedRule" })}
        </span>
      </Modal.Header>
      <Modal.Body>
        <div className="setting-section">
          <TextSettingModal
            heading={intl.formatMessage({
              id: "librarian.ruleEditModal.ruleName.heading",
            })}
            subHeading={intl.formatMessage({
              id: "librarian.ruleEditModal.ruleName.subHeading",
            })}
            value={rule.name}
            onChange={(name) => onChange({ ...rule, name })}
            placeholder={intl.formatMessage({
              id: "librarian.ruleEditModal.ruleName.placeholder",
            })}
          />

          {keepsInPlace ? (
            <p className="librarian-token-hint text-muted">
              {intl.formatMessage({
                id: "librarian.ruleEditModal.keepsInPlace.before",
              })}{" "}
              <code>{"{current}"}</code>
              {intl.formatMessage(
                { id: "librarian.ruleEditModal.keepsInPlace.after" },
                { entityNoun: countableNoun(intl, type) },
              )}
            </p>
          ) : (
            <LibraryRootPicker
              value={rule.libraryRoot || ""}
              entityType={entityType}
              subHeading={intl.formatMessage({
                id: "librarian.ruleEditModal.libraryRoot.subHeading",
              })}
              onChange={(libraryRoot) => onChange({ ...rule, libraryRoot })}
            />
          )}

          <PatternInput
            label={intl.formatMessage({
              id: "librarian.ruleEditModal.folderPattern.label",
            })}
            isFolder
            entityType={entityType}
            subHeading={intl.formatMessage({
              id: "librarian.ruleEditModal.folderPattern.subHeading",
            })}
            value={rule.folderPattern}
            onChange={(folderPattern) => onChange({ ...rule, folderPattern })}
          />

          <PatternInput
            label={intl.formatMessage({
              id: "librarian.ruleEditModal.filenamePattern.label",
            })}
            entityType={entityType}
            subHeading={intl.formatMessage({
              id: "librarian.ruleEditModal.filenamePattern.subHeading",
            })}
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
              {intl.formatMessage({
                id: "librarian.ruleEditModal.keepsBoth.before",
              })}{" "}
              <code>{"{current}"}</code>
              {intl.formatMessage(
                { id: "librarian.ruleEditModal.keepsBoth.after" },
                { entityNoun: countableNoun(intl, type) },
              )}
            </p>
          )}

          {(patternUsesAnyToken(rule.folderPattern, PERFORMER_SORT_TOKENS) ||
            patternUsesAnyToken(
              rule.filenamePattern,
              PERFORMER_SORT_TOKENS,
            )) && (
            <div>
              {intl.formatMessage({
                id: "librarian.ruleEditModal.sortPerformers",
              })}{" "}
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
                {intl.formatMessage({
                  id: "librarian.ruleEditModal.defaultStashIdSource",
                })}{" "}
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
            {matchCountHeading(intl, matchCount, countIsUpperBound, type)}
          </h4>
          {countIsUpperBound && (
            <p className="librarian-token-hint text-muted">
              {intl.formatMessage(
                { id: "librarian.ruleEditModal.upperBoundHint" },
                {
                  entityNoun: countableNoun(intl, type, false),
                  caveats: [
                    hasEarlierActiveRule &&
                      intl.formatMessage({
                        id: "librarian.ruleEditModal.caveat.earlierRule",
                      }),
                    gateApproximate &&
                      intl.formatMessage({
                        id: "librarian.ruleEditModal.caveat.gateApproximate",
                      }),
                    quantifierApproximate &&
                      intl.formatMessage(
                        {
                          id: "librarian.ruleEditModal.caveat.quantifierApproximate",
                        },
                        { entityNoun: countableNoun(intl, type) },
                      ),
                  ]
                    .filter(Boolean)
                    .join(
                      intl.formatMessage({ id: "librarian.common.listAnd" }),
                    ),
                },
              )}
            </p>
          )}
          <RulePreviewPanel rule={rule} config={config} entityType={type} />
        </div>
      </Modal.Body>
      <Modal.Footer className="ModalFooter">
        <div />
        <div>
          <Button variant="primary" className="ml-2" onClick={onClose}>
            {intl.formatMessage({ id: "actions.close" })}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
