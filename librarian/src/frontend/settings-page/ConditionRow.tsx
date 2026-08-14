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
  { value: "custom_field", label: "Custom field" },
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

// Each is satisfied by ONE performer, so an item matches as soon as any of its
// performers does, and that performer is the one {matched_performers} names
const PERFORMER_ONLY_MODIFIERS = [
  {
    value: "favorite",
    label: "is a favourite",
    title:
      "Matches if at least one of the {noun}'s performers is marked as a favourite",
  },
  {
    value: "rating",
    label: "is rated",
    title:
      "Matches if at least one of the {noun}'s performers has a rating in this range. Unrated performers never match",
  },
  {
    value: "custom_field",
    label: "has a custom field",
    title:
      "Matches if at least one of the {noun}'s performers has a custom field that compares this way",
  },
];

const PERFORMER_MODIFIERS = ANY_OR_ALL_MODIFIERS.concat(
  PERFORMER_ONLY_MODIFIERS,
);

const PERFORMER_ONLY_OPS = PERFORMER_ONLY_MODIFIERS.map((m) => m.value);

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
  performer: PERFORMER_MODIFIERS,
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

// Custom fields have no schema so we have to be SQLite for this one
const CUSTOM_FIELD_MODIFIERS = [
  {
    value: "EQUALS",
    label: "is",
    title:
      "Matches the whole value exactly, capitals included. A number and the same digits typed as text both match",
  },
  {
    value: "NOT_EQUALS",
    label: "is not",
    title:
      "Matches unless the whole value is exactly this. Items with no such field set also match",
  },
  {
    value: "INCLUDES",
    label: "contains",
    title:
      "Matches if the value contains this anywhere, ignoring capitals. “%” matches any run of characters and “_” any single one",
  },
  {
    value: "EXCLUDES",
    label: "doesn't contain",
    title:
      "Matches unless the value contains this. Items with no such field set also match",
  },
  {
    value: "MATCHES_REGEX",
    label: "matches regex",
    title:
      "Case-sensitive. Only use this on fields holding text: Stash fails the whole query, rather than returning nothing, if any item stores this field as a number",
  },
  {
    value: "NOT_MATCHES_REGEX",
    label: "doesn't match regex",
    title:
      "Case-sensitive, and matches items with no such field set. Same warning as “matches regex”: text-valued fields only",
  },
  {
    value: "GREATER_THAN",
    label: "is more than",
    title:
      "Compares the way Stash stores the value, so every number sorts before every piece of text: a field holding “3” as text is above 100",
  },
  {
    value: "LESS_THAN",
    label: "is less than",
    title:
      "Compares the way Stash stores the value, so every number sorts before every piece of text",
  },
  {
    value: "NOT_NULL",
    label: "is set",
    title: "Matches if the {noun} has this field with any value at all",
  },
  {
    value: "IS_NULL",
    label: "is not set",
    title: "Matches if the {noun} has no such field",
  },
];

const CUSTOM_FIELD_PRESENCE_OPS = ["IS_NULL", "NOT_NULL"];

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
  // custom fields only: which field, since the name is the user's own
  key?: string;
  // custom fields only: op is taken so we need valueOp
  valueOp?: string;
}

function valueShape(field: string, op: string): string {
  if (field === "rating" || op === "rating") return "range";
  if (field === "path" || field === "custom_field" || op === "custom_field")
    return "text";
  return "ids";
}

function defaultValue(
  field: string,
  op: string,
): string[] | RatingRange | string {
  const shape = valueShape(field, op);
  if (shape === "range") return { min: null, max: null };
  if (shape === "text") return "";
  return [];
}

function defaultValueForField(field: string): string[] | RatingRange | string {
  return defaultValue(field, "");
}

function withOp(condition: Condition, nextOp: string): Condition {
  const next: Condition = { ...condition, op: nextOp };
  if (
    valueShape(condition.field, condition.op) !==
    valueShape(condition.field, nextOp)
  ) {
    next.value = defaultValue(condition.field, nextOp);
  }
  if (nextOp === "custom_field") {
    next.valueOp = condition.valueOp || "EQUALS";
  } else {
    delete next.key;
    delete next.valueOp;
  }
  return next;
}

function nextOpForFieldChange(
  oldField: string,
  newField: string,
  currentOp: string,
): string {
  if (newField === "custom_field") {
    return "EQUALS";
  }
  if (newField === "path") {
    return "INCLUDES";
  }
  const newOptions = LIST_MODIFIERS_BY_FIELD[newField];
  if (!newOptions) {
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

// A custom field condition needs one more box than any other: which field, the
// name being the user's own rather than something Stash can enumerate. There is
// no API to list the names in use, so this is a plain text box and the exact
// spelling matters -- "series" finds nothing when the field is called "Series"
function CustomFieldEditor({
  condition,
  op,
  onChangeOp,
  onChange,
  noun,
}: {
  condition: Condition;
  op: string;
  onChangeOp: (next: string) => void;
  onChange: (next: Condition) => void;
  noun: string;
}) {
  const current =
    CUSTOM_FIELD_MODIFIERS.find((m) => m.value === op) ||
    CUSTOM_FIELD_MODIFIERS[0];
  const takesValue = CUSTOM_FIELD_PRESENCE_OPS.indexOf(op) === -1;
  return (
    <>
      <Form.Control
        className="input-control librarian-custom-field-name"
        type="text"
        value={condition.key || ""}
        placeholder="Field name"
        title="The custom field's name, spelled exactly as it is in Stash"
        onChange={(e: any) => onChange({ ...condition, key: e.target.value })}
      />
      <Form.Control
        as="select"
        className="librarian-inline-select input-control"
        title={withNoun(current.title, noun)}
        value={op}
        onChange={(e: any) => onChangeOp(e.target.value)}
      >
        {CUSTOM_FIELD_MODIFIERS.map((m) => (
          <option key={m.value} value={m.value} title={withNoun(m.title, noun)}>
            {m.label}
          </option>
        ))}
      </Form.Control>
      {takesValue && (
        <Form.Control
          className="input-control"
          type="text"
          value={(condition.value as string) || ""}
          placeholder="Value"
          onChange={(e: any) =>
            onChange({ ...condition, value: e.target.value })
          }
        />
      )}
    </>
  );
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
  // a performer condition that asks what a performer is like
  // rather than which performers there are
  const performerOp =
    condition.field === "performer" &&
    PERFORMER_ONLY_OPS.indexOf(condition.op) !== -1
      ? condition.op
      : "";
  const isRating = condition.field === "rating" || performerOp === "rating";
  const isPath = condition.field === "path";
  const isCustomField =
    condition.field === "custom_field" || performerOp === "custom_field";
  const isListField = LIST_FIELDS.indexOf(condition.field) !== -1;
  const isPresenceOp =
    condition.field === "group" ||
    performerOp === "favorite" ||
    condition.op === "is_null" ||
    condition.op === "not_null";
  const ids =
    !isRating && !isPath && !isCustomField && Array.isArray(condition.value)
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
          onChange={(nextOp) => onChange(withOp(condition, nextOp))}
          noun={noun}
        />
      )}
      {isCustomField ? (
        <CustomFieldEditor
          condition={condition}
          op={(performerOp ? condition.valueOp : condition.op) || "EQUALS"}
          onChangeOp={(nextOp) =>
            onChange(
              performerOp
                ? { ...condition, valueOp: nextOp }
                : { ...condition, op: nextOp },
            )
          }
          onChange={onChange}
          noun={noun}
        />
      ) : isRating ? (
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
