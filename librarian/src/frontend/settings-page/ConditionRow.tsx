import React from "react";
import { useIntl, IntlShape } from "react-intl";
import { adapterFor } from "../../core/entity-adapter.js";
import { countableNoun } from "../shared/eligible-entities.js";
import { useLoadSelectComponents } from "../shared/useLoadSelectComponents.js";

const PluginApi = (window as any).PluginApi;
const { Form, Button } = PluginApi.libraries.Bootstrap;

// label/title below are message ids, not display text: everything in this
// file is a module-level constant built once at import time, before any
// component (and its useIntl()) exists, so resolution happens at render time
// in the components that consume these arrays
const FIELD_OPTIONS = [
  { value: "studio", label: "studio" },
  { value: "performer", label: "performer" },
  { value: "tag", label: "tag" },
  { value: "group", label: "group" },
  { value: "rating", label: "rating" },
  { value: "path", label: "librarian.conditionRow.field.path" },
  {
    value: "custom_field",
    label: "librarian.conditionRow.field.customField",
  },
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
    label: "librarian.conditionRow.modifier.anyOf.label",
    title: "librarian.conditionRow.modifier.anyOf.title",
  },
  {
    value: "is_null",
    label: "librarian.conditionRow.modifier.isNull.label",
    title: "librarian.conditionRow.modifier.isNull.title",
  },
  {
    value: "not_null",
    label: "librarian.conditionRow.modifier.notNull.label",
    title: "librarian.conditionRow.modifier.notNull.title",
  },
];

const ANY_OR_ALL_MODIFIERS = [
  ANY_ONLY_MODIFIERS[0],
  {
    value: "all_of",
    label: "librarian.conditionRow.modifier.allOf.label",
    title: "librarian.conditionRow.modifier.allOf.title",
  },
  ANY_ONLY_MODIFIERS[1],
  ANY_ONLY_MODIFIERS[2],
];

// These ask what a performer is like rather than which performers there are.
// How many of them have to answer yes is the quantifier's job, so the wording
// here stays about the one performer
const PERFORMER_ONLY_MODIFIERS = [
  {
    value: "favorite",
    label: "librarian.conditionRow.modifier.favorite.label",
    title: "librarian.conditionRow.modifier.favorite.title",
  },
  {
    value: "not_favorite",
    label: "librarian.conditionRow.modifier.notFavorite.label",
    title: "librarian.conditionRow.modifier.notFavorite.title",
  },
  {
    value: "rating",
    label: "librarian.conditionRow.modifier.performerRating.label",
    title: "librarian.conditionRow.modifier.performerRating.title",
  },
  {
    value: "not_rated",
    label: "librarian.conditionRow.modifier.notRated.label",
    title: "librarian.conditionRow.modifier.notRated.title",
  },
  {
    value: "custom_field",
    label: "librarian.conditionRow.modifier.performerCustomField.label",
    title: "librarian.conditionRow.modifier.performerCustomField.title",
  },
];

const PERFORMER_QUANTIFIERS = [
  {
    value: "any",
    label: "librarian.conditionRow.quantifier.any.label",
    title: "librarian.conditionRow.quantifier.any.title",
  },
  {
    value: "all",
    label: "librarian.conditionRow.quantifier.all.label",
    title: "librarian.conditionRow.quantifier.all.title",
  },
];

const PERFORMER_MODIFIERS = ANY_OR_ALL_MODIFIERS.concat(
  PERFORMER_ONLY_MODIFIERS,
);

const PERFORMER_ONLY_OPS = PERFORMER_ONLY_MODIFIERS.map((m) => m.value);

// Ask something about the performer that needs no value from the user
const PERFORMER_PRESENCE_OPS = ["favorite", "not_favorite", "not_rated"];

const STUDIO_ONLY_MODIFIERS = [
  {
    value: "favorite",
    label: "librarian.conditionRow.modifier.studioFavorite.label",
    title: "librarian.conditionRow.modifier.studioFavorite.title",
  },
  {
    value: "not_favorite",
    label: "librarian.conditionRow.modifier.studioNotFavorite.label",
    title: "librarian.conditionRow.modifier.studioNotFavorite.title",
  },
  {
    value: "rating",
    label: "librarian.conditionRow.modifier.studioRating.label",
    title: "librarian.conditionRow.modifier.studioRating.title",
  },
  {
    value: "not_rated",
    label: "librarian.conditionRow.modifier.studioNotRated.label",
    title: "librarian.conditionRow.modifier.studioNotRated.title",
  },
  {
    value: "custom_field",
    label: "librarian.conditionRow.modifier.studioCustomField.label",
    title: "librarian.conditionRow.modifier.studioCustomField.title",
  },
];

const STUDIO_MODIFIERS = [
  ANY_ONLY_MODIFIERS[0],
  {
    value: "any_of_or_descendant",
    label: "librarian.conditionRow.modifier.anyOfOrDescendant.label",
    title: "librarian.conditionRow.modifier.anyOfOrDescendant.title",
  },
  ANY_ONLY_MODIFIERS[1],
  ANY_ONLY_MODIFIERS[2],
].concat(STUDIO_ONLY_MODIFIERS);

const STUDIO_ONLY_OPS = STUDIO_ONLY_MODIFIERS.map((m) => m.value);

// Ask something about the studio that needs no value from the user
const STUDIO_PRESENCE_OPS = ["favorite", "not_favorite", "not_rated"];

const GROUP_MODIFIERS = [
  {
    value: "not_null",
    label: "librarian.conditionRow.modifier.groupNotNull.label",
    title: "librarian.conditionRow.modifier.groupNotNull.title",
  },
  {
    value: "is_null",
    label: "librarian.conditionRow.modifier.groupIsNull.label",
    title: "librarian.conditionRow.modifier.groupIsNull.title",
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

const PATH_MODIFIERS = [
  {
    value: "INCLUDES",
    label: "librarian.conditionRow.pathModifier.includes.label",
    title: "librarian.conditionRow.pathModifier.includes.title",
  },
  {
    value: "EXCLUDES",
    label: "librarian.conditionRow.pathModifier.excludes.label",
    title: "librarian.conditionRow.pathModifier.excludes.title",
  },
  {
    value: "EQUALS",
    label: "librarian.conditionRow.pathModifier.equals.label",
    title: "librarian.conditionRow.pathModifier.equals.title",
  },
  {
    value: "NOT_EQUALS",
    label: "librarian.conditionRow.pathModifier.notEquals.label",
    title: "librarian.conditionRow.pathModifier.notEquals.title",
  },
  {
    value: "MATCHES_REGEX",
    label: "librarian.conditionRow.pathModifier.matchesRegex.label",
  },
  {
    value: "NOT_MATCHES_REGEX",
    label: "librarian.conditionRow.pathModifier.notMatchesRegex.label",
  },
];

// Custom fields have no schema so we have to be SQLite for this one
const CUSTOM_FIELD_MODIFIERS = [
  {
    value: "EQUALS",
    label: "librarian.conditionRow.customFieldModifier.equals.label",
    title: "librarian.conditionRow.customFieldModifier.equals.title",
  },
  {
    value: "NOT_EQUALS",
    label: "librarian.conditionRow.customFieldModifier.notEquals.label",
    title: "librarian.conditionRow.customFieldModifier.notEquals.title",
  },
  {
    value: "INCLUDES",
    label: "librarian.conditionRow.customFieldModifier.includes.label",
    title: "librarian.conditionRow.customFieldModifier.includes.title",
  },
  {
    value: "EXCLUDES",
    label: "librarian.conditionRow.customFieldModifier.excludes.label",
    title: "librarian.conditionRow.customFieldModifier.excludes.title",
  },
  {
    value: "MATCHES_REGEX",
    label: "librarian.conditionRow.customFieldModifier.matchesRegex.label",
    title: "librarian.conditionRow.customFieldModifier.matchesRegex.title",
  },
  {
    value: "NOT_MATCHES_REGEX",
    label: "librarian.conditionRow.customFieldModifier.notMatchesRegex.label",
    title: "librarian.conditionRow.customFieldModifier.notMatchesRegex.title",
  },
  {
    value: "GREATER_THAN",
    label: "librarian.conditionRow.customFieldModifier.greaterThan.label",
    title: "librarian.conditionRow.customFieldModifier.greaterThan.title",
  },
  {
    value: "LESS_THAN",
    label: "librarian.conditionRow.customFieldModifier.lessThan.label",
    title: "librarian.conditionRow.customFieldModifier.lessThan.title",
  },
  {
    value: "NOT_NULL",
    label: "librarian.conditionRow.customFieldModifier.notNull.label",
    title: "librarian.conditionRow.customFieldModifier.notNull.title",
  },
  {
    value: "IS_NULL",
    label: "librarian.conditionRow.customFieldModifier.isNull.label",
    title: "librarian.conditionRow.customFieldModifier.isNull.title",
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
  // performer-only ops: how many performers must satisfy it. Absent means "any"
  quantifier?: string;
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
  // an op that is not about what a performer is like has nothing to quantify
  if (PERFORMER_ONLY_OPS.indexOf(nextOp) === -1) {
    delete next.quantifier;
  }
  return next;
}

function withQuantifier(condition: Condition, next: string): Condition {
  const updated: Condition = { ...condition };
  if (next === "all") {
    updated.quantifier = "all";
  } else {
    delete updated.quantifier;
  }
  return updated;
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
  const intl = useIntl();
  return (
    <div className="librarian-rating-range">
      <Form.Control
        className="input-control"
        type="number"
        min={0}
        max={10}
        step={0.1}
        placeholder={intl.formatMessage({
          id: "librarian.conditionRow.rating.min",
        })}
        value={value.min == null ? "" : value.min}
        onChange={(e: any) =>
          onChange({ ...value, min: parseRatingBound(e.target.value) })
        }
      />
      <span>
        {intl.formatMessage({ id: "librarian.conditionRow.rating.to" })}
      </span>
      <Form.Control
        className="input-control"
        type="number"
        min={0}
        max={10}
        step={0.1}
        placeholder={intl.formatMessage({
          id: "librarian.conditionRow.rating.max",
        })}
        value={value.max == null ? "" : value.max}
        onChange={(e: any) =>
          onChange({ ...value, max: parseRatingBound(e.target.value) })
        }
      />
      <span className="librarian-token-hint text-muted">
        {intl.formatMessage({ id: "librarian.conditionRow.rating.hint" })}
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
  const intl = useIntl();
  const currentTitleId = PATH_MODIFIERS.find((m) => m.value === op)?.title;
  return (
    <>
      <Form.Control
        as="select"
        className="librarian-inline-select input-control"
        title={
          currentTitleId
            ? intl.formatMessage({ id: currentTitleId })
            : undefined
        }
        value={op}
        onChange={(e: any) => onChangeOp(e.target.value)}
      >
        {PATH_MODIFIERS.map((m) => (
          <option
            key={m.value}
            value={m.value}
            title={m.title ? intl.formatMessage({ id: m.title }) : undefined}
          >
            {intl.formatMessage({ id: m.label })}
          </option>
        ))}
      </Form.Control>
      <Form.Control
        className="input-control"
        type="text"
        value={value || ""}
        placeholder={intl.formatMessage({
          id: "librarian.conditionRow.path.placeholder",
        })}
        onChange={(e: any) => onChangeValue(e.target.value)}
      />
    </>
  );
}

// Modifier tooltips are written with a {noun} placeholder so the same copy
// reads correctly on the scenes, galleries and images tabs. The placeholder
// is escaped in the message catalog (it's not an ICU argument), so it comes
// back out of formatMessage as a literal "{noun}" for this to replace.
function withNoun(
  intl: IntlShape,
  titleId: string | undefined,
  noun: string,
): string {
  if (!titleId) return "";
  // Passing {} rather than omitting the second argument: formatjs resolves
  // quoted-literal escapes differently (and unreliably for adjacent quotes,
  // e.g. '{noun}''s') when no values object is given at all
  return intl.formatMessage({ id: titleId }, {}).replace(/{noun}/g, noun);
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
  const intl = useIntl();
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
        placeholder={intl.formatMessage({
          id: "librarian.conditionRow.customField.namePlaceholder",
        })}
        title={intl.formatMessage({
          id: "librarian.conditionRow.customField.nameTitle",
        })}
        onChange={(e: any) => onChange({ ...condition, key: e.target.value })}
      />
      <Form.Control
        as="select"
        className="librarian-inline-select input-control"
        title={withNoun(intl, current.title, noun)}
        value={op}
        onChange={(e: any) => onChangeOp(e.target.value)}
      >
        {CUSTOM_FIELD_MODIFIERS.map((m) => (
          <option
            key={m.value}
            value={m.value}
            title={withNoun(intl, m.title, noun)}
          >
            {intl.formatMessage({ id: m.label })}
          </option>
        ))}
      </Form.Control>
      {takesValue && (
        <Form.Control
          className="input-control"
          type="text"
          value={(condition.value as string) || ""}
          placeholder={intl.formatMessage({
            id: "custom_fields.value",
          })}
          onChange={(e: any) =>
            onChange({ ...condition, value: e.target.value })
          }
        />
      )}
    </>
  );
}

function QuantifierSelect({
  value,
  onChange,
  noun,
}: {
  value: string;
  onChange: (next: string) => void;
  noun: string;
}) {
  const intl = useIntl();
  const current =
    PERFORMER_QUANTIFIERS.find((q) => q.value === value) ||
    PERFORMER_QUANTIFIERS[0];
  return (
    <Form.Control
      as="select"
      className="librarian-inline-select input-control"
      title={withNoun(intl, current.title, noun)}
      value={current.value}
      onChange={(e: any) => onChange(e.target.value)}
    >
      {PERFORMER_QUANTIFIERS.map((q) => (
        <option
          key={q.value}
          value={q.value}
          title={withNoun(intl, q.title, noun)}
        >
          {intl.formatMessage({ id: q.label })}
        </option>
      ))}
    </Form.Control>
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
  const intl = useIntl();
  const options = LIST_MODIFIERS_BY_FIELD[field] || ANY_ONLY_MODIFIERS;
  const current = options.find((o) => o.value === op) || options[0];
  return (
    <Form.Control
      as="select"
      className="librarian-inline-select input-control"
      title={withNoun(intl, current.title, noun)}
      value={op}
      onChange={(e: any) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option
          key={o.value}
          value={o.value}
          title={withNoun(intl, o.title, noun)}
        >
          {intl.formatMessage({ id: o.label })}
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
  const intl = useIntl();
  return (
    <Form.Control
      as="select"
      className="librarian-inline-select input-control"
      value={field}
      onChange={(e: any) => onChange(e.target.value)}
    >
      {fieldOptionsFor(entityType).map((f) => (
        <option key={f.value} value={f.value}>
          {intl.formatMessage({ id: f.label })}
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
  const intl = useIntl();
  const noun = countableNoun(intl, entityType || "scenes", false);
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
  const studioOp =
    condition.field === "studio" && STUDIO_ONLY_OPS.indexOf(condition.op) !== -1
      ? condition.op
      : "";
  const isRating =
    condition.field === "rating" ||
    performerOp === "rating" ||
    studioOp === "rating";
  const isPath = condition.field === "path";
  const isCustomField =
    condition.field === "custom_field" ||
    performerOp === "custom_field" ||
    studioOp === "custom_field";
  const isListField = LIST_FIELDS.indexOf(condition.field) !== -1;
  const isPresenceOp =
    condition.field === "group" ||
    PERFORMER_PRESENCE_OPS.indexOf(performerOp) !== -1 ||
    STUDIO_PRESENCE_OPS.indexOf(studioOp) !== -1 ||
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
      {performerOp && (
        <QuantifierSelect
          value={condition.quantifier || "any"}
          onChange={(next) => onChange(withQuantifier(condition, next))}
          noun={noun}
        />
      )}
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
          op={
            (performerOp || studioOp ? condition.valueOp : condition.op) ||
            "EQUALS"
          }
          onChangeOp={(nextOp) =>
            onChange(
              performerOp || studioOp
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
          placeholder={intl.formatMessage({
            id: loadingSelectComponents
              ? "librarian.conditionRow.idFallback.loading"
              : "librarian.conditionRow.idFallback.error",
          })}
          onChange={(e: any) =>
            onChange({ ...condition, value: textToIds(e.target.value) })
          }
        />
      )}
      <Button
        variant="secondary"
        onClick={onRemove}
        title={intl.formatMessage({
          id: "librarian.conditionRow.removeCondition",
        })}
      >
        ✕
      </Button>
    </div>
  );
}
