import React from "react";
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
  const conditionLogic = value.conditionLogic === "OR" ? "OR" : "AND";
  const conditions = value.conditions || [];

  return (
    <>
      <div>
        Match{" "}
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
          <option value="AND">ALL</option>
          <option value="OR">ANY</option>
        </Form.Control>{" "}
        of the following conditions
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
        + Add condition
      </Button>
    </>
  );
}
