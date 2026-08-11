import React from "react";
import { adapterFor } from "../../core/entity-adapter.js";
import { useLoadSelectComponents } from "../shared/useLoadSelectComponents.js";

const PluginApi = (window as any).PluginApi;
const { Form, Button } = PluginApi.libraries.Bootstrap;

const FIELD_OPTIONS = [
  { value: "studio", label: "Studio" },
  { value: "performer", label: "Performer" },
  { value: "tag", label: "Tag" },
  { value: "group", label: "Group" },
  { value: "rating", label: "Rating" },
  { value: "path", label: "File path" },
];

// Only scenes have groups
function fieldOptionsFor(entityType?: string) {
  if (adapterFor(entityType).hasGroups) {
    return FIELD_OPTIONS;
  }
  return FIELD_OPTIONS.filter((f) => f.value !== "group");
}

const ANY_ONLY_MODIFIERS = [
  {
    value: "any_of",
    label: "is any of",
    title: "Matches if the {noun} has at least one of the selected entries",
  },
  {
    value: "is_null",
    label: "is not set",
    title: "Matches if the {noun} has none set at all",
  },
  {
    value: "not_null",
    label: "has any value",
    title: "Matches if the {noun} has at least one set, regardless of which",
  },
];

const ANY_OR_ALL_MODIFIERS = [
  ANY_ONLY_MODIFIERS[0],
  {
    value: "all_of",
    label: "is all of",
    title: "Matches only if the {noun} has every one of the selected entries",
  },
  ANY_ONLY_MODIFIERS[1],
  ANY_ONLY_MODIFIERS[2],
];

const STUDIO_MODIFIERS = [
  ANY_ONLY_MODIFIERS[0],
  {
    value: "any_of_or_descendant",
    label: "is any of (including subsidiaries)",
    title:
      "Matches if the {noun}'s studio is one of the selected entries, or a subsidiary of one",
  },
  ANY_ONLY_MODIFIERS[1],
  ANY_ONLY_MODIFIERS[2],
];

const GROUP_MODIFIERS = [
  {
    value: "not_null",
    label: "is set",
    title: "Matches if the {noun} belongs to a group, whichever one it is",
  },
  {
    value: "is_null",
    label: "is not set",
    title: "Matches if the {noun} belongs to no group at all",
  },
];

const LIST_MODIFIERS_BY_FIELD: Record<string, typeof ANY_ONLY_MODIFIERS> = {
  studio: STUDIO_MODIFIERS,
  performer: ANY_OR_ALL_MODIFIERS,
  tag: ANY_OR_ALL_MODIFIERS,
  group: GROUP_MODIFIERS,
};

const LIST_FIELDS = Object.keys(LIST_MODIFIERS_BY_FIELD);

const SELECT_COMPONENT_BY_FIELD: Record<string, string> = {
  studio: "StudioIDSelect",
  performer: "PerformerIDSelect",
  tag: "TagIDSelect",
};

const PHRASE_HINT =
  ' Several words are matched separately, so "The Reunion" also matches' +
  ' "Friends Reunion". Wrap the value in double quotes to match it as one' +
  " phrase. “%” matches any run of characters and “_” any single one";

const PATH_MODIFIERS = [
  {
    value: "INCLUDES",
    label: "contains",
    title: "Matches if the path contains this." + PHRASE_HINT,
  },
  {
    value: "EXCLUDES",
    label: "doesn't contain",
    title: "Matches only if the path contains none of this." + PHRASE_HINT,
  },
  {
    value: "EQUALS",
    label: "is",
    title:
      "Matches only if the whole path is exactly this, folders included." +
      " Words are not split and quotes are not special here",
  },
  {
    value: "NOT_EQUALS",
    label: "is not",
    title: "Matches unless the whole path is exactly this, folders included",
  },
  { value: "MATCHES_REGEX", label: "matches regex" },
  { value: "NOT_MATCHES_REGEX", label: "doesn't match regex" },
];

function idsToText(value: unknown): string {
  return Array.isArray(value) ? value.join(", ") : "";
}

function textToIds(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface RatingRange {
  min: number | null;
  max: number | null;
}

export interface Condition {
  field: string;
  op: string;
  value: string[] | RatingRange | string;
}

function defaultValueForField(field: string): string[] | RatingRange | string {
  if (field === "rating") return { min: null, max: null };
  if (field === "path") return "";
  return [];
}

function nextOpForFieldChange(
  oldField: string,
  newField: string,
  currentOp: string,
): string {
  if (newField === "path") {
    return "INCLUDES";
  }
  const newOptions = LIST_MODIFIERS_BY_FIELD[newField];
  if (!newOptions) {
    // rating has no op of its own, the range is the whole condition
    return "any_of";
  }
  if (
    LIST_FIELDS.indexOf(oldField) !== -1 &&
    newOptions.some((o) => o.value === currentOp)
  ) {
    return currentOp;
  }
  return newOptions[0].value;
}

function parseRatingBound(text: string): number | null {
  if (text === "") {
    return null;
  }
  const n = parseFloat(text);
  return Number.isNaN(n) ? null : n;
}

function RatingRangeEditor({
  value,
  onChange,
}: {
  value: RatingRange;
  onChange: (next: RatingRange) => void;
}) {
  return (
    <div className="librarian-rating-range">
      <Form.Control
        className="input-control"
        type="number"
        min={0}
        max={10}
        step={0.1}
        placeholder="Min"
        value={value.min == null ? "" : value.min}
        onChange={(e: any) =>
          onChange({ ...value, min: parseRatingBound(e.target.value) })
        }
      />
      <span>to</span>
      <Form.Control
        className="input-control"
        type="number"
        min={0}
        max={10}
        step={0.1}
        placeholder="Max"
        value={value.max == null ? "" : value.max}
        onChange={(e: any) =>
          onChange({ ...value, max: parseRatingBound(e.target.value) })
        }
      />
      <span className="librarian-token-hint text-muted">
        (0-10 scale, either side optional)
      </span>
    </div>
  );
}

function PathValueEditor({
  op,
  value,
  onChangeOp,
  onChangeValue,
}: {
  op: string;
  value: string;
  onChangeOp: (op: string) => void;
  onChangeValue: (value: string) => void;
}) {
  return (
    <>
      <Form.Control
        as="select"
        className="librarian-inline-select input-control"
        title={PATH_MODIFIERS.find((m) => m.value === op)?.title}
        value={op}
        onChange={(e: any) => onChangeOp(e.target.value)}
      >
        {PATH_MODIFIERS.map((m) => (
          <option key={m.value} value={m.value} title={m.title}>
            {m.label}
          </option>
        ))}
      </Form.Control>
      <Form.Control
        className="input-control"
        type="text"
        value={value || ""}
        placeholder="/data/old-files"
        onChange={(e: any) => onChangeValue(e.target.value)}
      />
    </>
  );
}

// Modifier tooltips are written with a {noun} placeholder so the same copy
// reads correctly on the scenes, galleries and images tabs
function withNoun(text: string | undefined, noun: string): string {
  return (text || "").replace(/{noun}/g, noun);
}

function ListModifierSelect({
  field,
  op,
  onChange,
  noun,
}: {
  field: string;
  op: string;
  onChange: (op: string) => void;
  noun: string;
}) {
  const options = LIST_MODIFIERS_BY_FIELD[field] || ANY_ONLY_MODIFIERS;
  const current = options.find((o) => o.value === op) || options[0];
  return (
    <Form.Control
      as="select"
      className="librarian-inline-select input-control"
      title={withNoun(current.title, noun)}
      value={op}
      onChange={(e: any) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} title={withNoun(o.title, noun)}>
          {o.label}
        </option>
      ))}
    </Form.Control>
  );
}

function FieldSelect({
  field,
  onChange,
  entityType,
}: {
  field: string;
  onChange: (field: string) => void;
  entityType?: string;
}) {
  return (
    <Form.Control
      as="select"
      className="librarian-inline-select input-control"
      value={field}
      onChange={(e: any) => onChange(e.target.value)}
    >
      {fieldOptionsFor(entityType).map((f) => (
        <option key={f.value} value={f.value}>
          {f.label}
        </option>
      ))}
    </Form.Control>
  );
}

interface ConditionRowProps {
  condition: Condition;
  onChange: (next: Condition) => void;
  onRemove: () => void;
  entityType?: string;
}

export function ConditionRow({
  condition,
  onChange,
  onRemove,
  entityType,
}: ConditionRowProps) {
  const noun = adapterFor(entityType).noun;
  const loadingSelectComponents = useLoadSelectComponents([
    "studio",
    "performer",
    "tag",
  ]);
  const isRating = condition.field === "rating";
  const isPath = condition.field === "path";
  const isListField = LIST_FIELDS.indexOf(condition.field) !== -1;
  const isPresenceOp =
    condition.field === "group" ||
    condition.op === "is_null" ||
    condition.op === "not_null";
  const ids =
    !isRating && !isPath && Array.isArray(condition.value)
      ? (condition.value as string[])
      : [];
  const SelectComponent =
    PluginApi?.components?.[SELECT_COMPONENT_BY_FIELD[condition.field]];

  return (
    <div className="librarian-condition-row">
      <FieldSelect
        field={condition.field}
        entityType={entityType}
        onChange={(newField) => {
          onChange({
            field: newField,
            op: nextOpForFieldChange(condition.field, newField, condition.op),
            value: defaultValueForField(newField),
          });
        }}
      />
      {isListField && (
        <ListModifierSelect
          field={condition.field}
          op={condition.op}
          onChange={(nextOp) => onChange({ ...condition, op: nextOp })}
          noun={noun}
        />
      )}
      {isRating ? (
        <RatingRangeEditor
          value={(condition.value as RatingRange) || { min: null, max: null }}
          onChange={(next) => onChange({ ...condition, value: next })}
        />
      ) : isPath ? (
        <PathValueEditor
          op={condition.op}
          value={condition.value as string}
          onChangeOp={(nextOp) => onChange({ ...condition, op: nextOp })}
          onChangeValue={(nextValue) =>
            onChange({ ...condition, value: nextValue })
          }
        />
      ) : isPresenceOp ? null /* is_null/not_null: nothing to pick */ : SelectComponent ? (
        <div className="librarian-entity-select">
          <SelectComponent
            ids={ids}
            isMulti
            menuPortalTarget={document.body}
            onSelect={(items: { id: string }[]) =>
              onChange({ ...condition, value: items.map((i) => String(i.id)) })
            }
          />
        </div>
      ) : (
        <Form.Control
          className="input-control"
          type="text"
          value={idsToText(ids)}
          placeholder={
            loadingSelectComponents
              ? "id1, id2, ... (loading)"
              : "id1, id2, ... (this error should never occur)"
          }
          onChange={(e: any) =>
            onChange({ ...condition, value: textToIds(e.target.value) })
          }
        />
      )}
      <Button variant="secondary" onClick={onRemove} title="Remove condition">
        ✕
      </Button>
    </div>
  );
}
