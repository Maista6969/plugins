import React from "react";
import { useIntl } from "react-intl";
import { ConditionRow, Condition, fieldLabel } from "./ConditionRow.js";
import { countableNoun } from "../shared/eligible-entities.js";
import {
  findConditionProblems,
  textWordSplit,
  unreadableRegex,
} from "../../core/rule-lint.js";

const PluginApi = (window as any).PluginApi;
const { Form, Button } = PluginApi.libraries.Bootstrap;

export interface ConditionsValue {
  conditionLogic: "AND" | "OR";
  conditions: ConditionItem[];
}

// A group is shaped like a rule's own conditions, so the editor nests itself
export type ConditionItem = Condition | ConditionsValue;

function isGroup(item: ConditionItem): item is ConditionsValue {
  return Array.isArray((item as ConditionsValue).conditions);
}

interface ConditionsEditorProps {
  entityType?: string;
  value: ConditionsValue;
  onChange: (next: ConditionsValue) => void;
  // a group inside a rule holds no groups of its own
  nested?: boolean;
}

function newCondition(): Condition {
  return { field: "tag", op: "any_of", value: [] };
}

// One conjunction per list: every row after the first shows the same and/or
// select, so it can be changed from any row; the first row keeps the column
function Conjunction({
  index,
  logic,
  onChange,
}: {
  index: number;
  logic: "AND" | "OR";
  onChange: (next: "AND" | "OR") => void;
}) {
  const intl = useIntl();
  const word = (id: string) =>
    intl.formatMessage({ id: "librarian.conditionsEditor." + id });
  if (index > 0) {
    return (
      <Form.Control
        as="select"
        className="librarian-conjunction librarian-inline-select input-control"
        value={logic}
        onChange={(e: any) => onChange(e.target.value as "AND" | "OR")}
      >
        <option value="AND">{word("and")}</option>
        <option value="OR">{word("or")}</option>
      </Form.Control>
    );
  }
  return <span className="librarian-conjunction" />;
}

export function ConditionsEditor({
  value,
  onChange,
  nested,
  entityType,
}: ConditionsEditorProps) {
  const intl = useIntl();
  const conditionLogic = value.conditionLogic === "OR" ? "OR" : "AND";
  const conditions = value.conditions || [];
  const problems = findConditionProblems(conditionLogic, conditions);
  // a lone condition has nothing to be joined to
  const joined = conditions.length > 1;
  // a Stash filter level holds one sub-filter, so a rule holds one group
  const hasGroup = conditions.some(isGroup);

  function replaceAt(index: number, next: ConditionItem) {
    const nextConditions = conditions.slice();
    nextConditions[index] = next;
    onChange({ ...value, conditions: nextConditions });
  }

  function removeAt(index: number) {
    const nextConditions = conditions.slice();
    nextConditions.splice(index, 1);
    onChange({ ...value, conditions: nextConditions });
  }

  return (
    <>
      {conditions.map((condition, index) => {
        const splitTerms = isGroup(condition) ? null : textWordSplit(condition);
        return (
          <div key={index} className="librarian-condition-line">
            {joined && (
              <Conjunction
                index={index}
                logic={conditionLogic}
                onChange={(next) =>
                  onChange({ ...value, conditionLogic: next })
                }
              />
            )}
            {isGroup(condition) ? (
              <>
                <div className="librarian-condition-group">
                  <ConditionsEditor
                    nested
                    entityType={entityType}
                    value={condition}
                    // a group emptied out is gone, not a member that never holds
                    onChange={(next) =>
                      next.conditions.length > 0
                        ? replaceAt(index, next)
                        : removeAt(index)
                    }
                  />
                </div>
                <Button
                  variant="secondary"
                  onClick={() => removeAt(index)}
                  title={intl.formatMessage({
                    id: "librarian.conditionsEditor.removeGroup",
                  })}
                >
                  ✕
                </Button>
              </>
            ) : (
              <div className="librarian-condition-cell">
                <ConditionRow
                  entityType={entityType}
                  condition={condition}
                  onChange={(next) => replaceAt(index, next)}
                  onRemove={() => removeAt(index)}
                />
                {splitTerms && (
                  <p className="librarian-token-hint text-warning">
                    {intl.formatMessage(
                      { id: "librarian.conditionRow.wordSplit" },
                      {
                        count: splitTerms.length,
                        terms: splitTerms.map((t) => "“" + t + "”").join(", "),
                      },
                    )}
                  </p>
                )}
                {unreadableRegex(condition) && (
                  <p className="librarian-token-hint text-warning">
                    {intl.formatMessage({
                      id: "librarian.conditionRow.unreadableRegex",
                    })}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
      {problems.map((problem) => (
        <p
          key={problem.kind + problem.field + problem.key}
          className="librarian-token-hint text-warning"
        >
          {intl.formatMessage(
            {
              id:
                problem.kind === "always_matches"
                  ? "librarian.conditionsEditor.alwaysMatches"
                  : "librarian.conditionsEditor.neverMatches",
            },
            {
              field:
                fieldLabel(intl, problem.field) +
                (problem.key ? " “" + problem.key + "”" : ""),
              entityNoun: countableNoun(
                intl,
                entityType || "scenes",
                problem.kind === "never_matches",
              ),
            },
          )}
        </p>
      ))}
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          onChange({ ...value, conditions: [...conditions, newCondition()] })
        }
      >
        {intl.formatMessage({ id: "librarian.conditionsEditor.addCondition" })}
      </Button>{" "}
      {!nested && (
        <Button
          variant="secondary"
          size="sm"
          disabled={hasGroup}
          title={
            hasGroup
              ? intl.formatMessage({
                  id: "librarian.conditionsEditor.oneGroup",
                })
              : undefined
          }
          onClick={() =>
            onChange({
              ...value,
              // two rows, so the group's own and/or is there to pick at once
              conditions: [
                ...conditions,
                {
                  conditionLogic: "OR",
                  conditions: [newCondition(), newCondition()],
                },
              ],
            })
          }
        >
          {intl.formatMessage({ id: "librarian.conditionsEditor.addGroup" })}
        </Button>
      )}
    </>
  );
}
