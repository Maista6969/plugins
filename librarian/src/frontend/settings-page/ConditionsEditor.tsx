import React from "react";
import { useIntl } from "react-intl";
import { ConditionRow, Condition } from "./ConditionRow.js";

const PluginApi = (window as any).PluginApi;
const { Form, Button } = PluginApi.libraries.Bootstrap;

export interface ConditionsValue {
  conditionLogic: "AND" | "OR";
  conditions: Condition[];
}

interface ConditionsEditorProps {
  entityType?: string;
  value: ConditionsValue;
  onChange: (next: ConditionsValue) => void;
}

function newCondition(): Condition {
  return { field: "tag", op: "any_of", value: [] };
}

export function ConditionsEditor({
  value,
  onChange,
  entityType,
}: ConditionsEditorProps) {
  const intl = useIntl();
  const conditionLogic = value.conditionLogic === "OR" ? "OR" : "AND";
  const conditions = value.conditions || [];

  return (
    <>
      <div>
        {intl.formatMessage({ id: "librarian.conditionsEditor.matchBefore" })}{" "}
        <Form.Control
          as="select"
          className="librarian-inline-select input-control"
          value={conditionLogic}
          onChange={(e: any) =>
            onChange({
              ...value,
              conditionLogic: e.target.value as "AND" | "OR",
            })
          }
        >
          <option value="AND">
            {intl.formatMessage({ id: "librarian.conditionsEditor.all" })}
          </option>
          <option value="OR">
            {intl.formatMessage({ id: "librarian.conditionsEditor.any" })}
          </option>
        </Form.Control>{" "}
        {intl.formatMessage({ id: "librarian.conditionsEditor.matchAfter" })}
      </div>

      {conditions.map((condition, index) => (
        <ConditionRow
          entityType={entityType}
          key={index}
          condition={condition}
          onChange={(next) => {
            const nextConditions = conditions.slice();
            nextConditions[index] = next;
            onChange({ ...value, conditions: nextConditions });
          }}
          onRemove={() => {
            const nextConditions = conditions.slice();
            nextConditions.splice(index, 1);
            onChange({ ...value, conditions: nextConditions });
          }}
        />
      ))}
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          onChange({ ...value, conditions: [...conditions, newCondition()] })
        }
      >
        {intl.formatMessage({ id: "librarian.conditionsEditor.addCondition" })}
      </Button>
    </>
  );
}
