import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateCustomField,
  criterionValue,
  customFieldText,
} from "../../src/core/custom-fields.js";
import {
  evaluateCondition,
  describeCondition,
} from "../../src/core/rule-engine.js";
import { ruleToSceneFilter } from "../../src/core/rule-to-filter.js";
import { normalizeScene } from "../../src/core/normalize-scene.js";
import { scanPattern } from "../../src/core/token-grammar.js";
import {
  renderTemplate,
  buildTokens,
  findPatternProblems,
  findMissingRequiredData,
  KNOWN_TOKENS,
} from "../../src/core/path-template.js";

const SCENE_FIELDS = {
  Series: "Anita's Adventures",
  Episode: 3,
  Archived: 1,
};
const OTHER_FIELDS = { Series: "Betty Files", Episode: 12 };
const TEXTY_FIELDS = { Series: "Walkthroughs", Episode: "3" };

function check(fields, op, value) {
  return evaluateCustomField(fields, "Episode", op, value);
}

test("EQUALS is exact and case-sensitive", () => {
  assert.equal(
    evaluateCustomField(OTHER_FIELDS, "Series", "EQUALS", "Betty Files"),
    true,
  );
  assert.equal(
    evaluateCustomField(OTHER_FIELDS, "Series", "EQUALS", "betty files"),
    false,
  );
  assert.equal(
    evaluateCustomField(OTHER_FIELDS, "Series", "EQUALS", "Betty"),
    false,
  );
  // no LIKE wildcards on EQUALS, unlike the path condition's EQUALS
  assert.equal(
    evaluateCustomField(OTHER_FIELDS, "Series", "EQUALS", "Betty%"),
    false,
  );
});

// The server compares an int 3 and the string "3" as different values, so a
// single text box can only reach both because criterionValue sends both
// readings. These two tests are the halves of that bargain
test("EQUALS reaches a field stored as a number and one stored as text", () => {
  assert.equal(check(SCENE_FIELDS, "EQUALS", "3"), true);
  assert.equal(check(TEXTY_FIELDS, "EQUALS", "3"), true);
  assert.equal(check(OTHER_FIELDS, "EQUALS", "3"), false);
});

test("criterionValue sends both readings for EQUALS and one for the rest", () => {
  assert.deepEqual(criterionValue("EQUALS", "3"), ["3", 3]);
  assert.deepEqual(criterionValue("NOT_EQUALS", "3"), ["3", 3]);
  assert.deepEqual(criterionValue("EQUALS", "Betty Files"), ["Betty Files"]);
  assert.deepEqual(criterionValue("INCLUDES", "3"), ["3"]);
  // the ordered comparisons get the single reading SQLite will compare against
  assert.deepEqual(criterionValue("GREATER_THAN", "5"), [5]);
  assert.deepEqual(criterionValue("GREATER_THAN", "B"), ["B"]);
  assert.equal(criterionValue("IS_NULL", ""), null);
  assert.equal(criterionValue("NOT_NULL", "x"), null);
  assert.equal(criterionValue("INCLUDES", ""), null);
});

test("a text box that reads as a number does not match text holding another spelling of it", () => {
  // the server, sent ["3.0", 3], matches the int but not the string "3"
  assert.equal(check(SCENE_FIELDS, "EQUALS", "3.0"), true);
  assert.equal(check(TEXTY_FIELDS, "EQUALS", "3.0"), false);
});

test("INCLUDES is a contiguous LIKE, case-insensitive and with wildcards", () => {
  const s = (value) =>
    evaluateCustomField(OTHER_FIELDS, "Series", "INCLUDES", value);
  assert.equal(s("files"), true);
  assert.equal(s("Bett_"), true);
  assert.equal(s("%"), true);
  assert.equal(
    evaluateCustomField(SCENE_FIELDS, "Series", "INCLUDES", "Anita Adventures"),
    false,
  );
  assert.equal(
    evaluateCustomField(SCENE_FIELDS, "Series", "INCLUDES", "s Adventures"),
    true,
  );
  // INCLUDES compares the text form, so it reaches a number too
  assert.equal(check(SCENE_FIELDS, "INCLUDES", "3"), true);
  assert.equal(check(OTHER_FIELDS, "INCLUDES", "1"), true);
});

test("every negating modifier also matches an item with no such field", () => {
  const none = {};
  assert.equal(
    evaluateCustomField(none, "Series", "NOT_EQUALS", "Betty Files"),
    true,
  );
  assert.equal(evaluateCustomField(none, "Series", "EXCLUDES", "Betty"), true);
  assert.equal(
    evaluateCustomField(none, "Series", "NOT_MATCHES_REGEX", "^B"),
    true,
  );
  // and the positive ones do not
  assert.equal(
    evaluateCustomField(none, "Series", "EQUALS", "Betty Files"),
    false,
  );
  assert.equal(evaluateCustomField(none, "Series", "INCLUDES", "Betty"), false);
  assert.equal(
    evaluateCustomField(none, "Series", "MATCHES_REGEX", "^B"),
    false,
  );
  assert.equal(evaluateCustomField(none, "Series", "GREATER_THAN", "0"), false);
});

test("IS_NULL counts a key that was never set", () => {
  assert.equal(evaluateCustomField({}, "Series", "IS_NULL"), true);
  assert.equal(evaluateCustomField(SCENE_FIELDS, "Series", "IS_NULL"), false);
  assert.equal(evaluateCustomField(SCENE_FIELDS, "Series", "NOT_NULL"), true);
  assert.equal(evaluateCustomField({}, "Series", "NOT_NULL"), false);
});

test("MATCHES_REGEX is case-sensitive", () => {
  assert.equal(
    evaluateCustomField(SCENE_FIELDS, "Series", "MATCHES_REGEX", "^Anita"),
    true,
  );
  assert.equal(
    evaluateCustomField(SCENE_FIELDS, "Series", "MATCHES_REGEX", "^ANITA"),
    false,
  );
  // an unparseable pattern is no match rather than an exception
  assert.equal(
    evaluateCustomField(SCENE_FIELDS, "Series", "MATCHES_REGEX", "("),
    false,
  );
});

test("the ordered comparisons put every number below every piece of text", () => {
  assert.equal(check(OTHER_FIELDS, "GREATER_THAN", "5"), true); // 12 > 5
  assert.equal(check(SCENE_FIELDS, "GREATER_THAN", "5"), false); // 3 > 5
  assert.equal(check(TEXTY_FIELDS, "GREATER_THAN", "5"), true); // "3" is text
  assert.equal(check(OTHER_FIELDS, "GREATER_THAN", "100"), false); // 12 > 100
  assert.equal(check(TEXTY_FIELDS, "GREATER_THAN", "100"), true); // still text
  assert.equal(check(SCENE_FIELDS, "LESS_THAN", "5"), true);
});

test("text compares against text byte-wise", () => {
  assert.equal(
    evaluateCustomField(OTHER_FIELDS, "Series", "GREATER_THAN", "B"),
    true,
  );
  assert.equal(
    evaluateCustomField(SCENE_FIELDS, "Series", "GREATER_THAN", "B"),
    false,
  );
  assert.equal(
    evaluateCustomField(SCENE_FIELDS, "Series", "LESS_THAN", "B"),
    true,
  );
});

test("an unfinished condition matches nothing rather than everything", () => {
  assert.equal(
    evaluateCustomField(SCENE_FIELDS, "Series", "EQUALS", ""),
    false,
  );
  assert.equal(evaluateCustomField(SCENE_FIELDS, "", "NOT_NULL", ""), false);
  assert.equal(evaluateCustomField(SCENE_FIELDS, null, "IS_NULL", ""), false);
});

test("a boolean written into the map reads as Stash stores it", () => {
  assert.equal(customFieldText(true), "1");
  assert.equal(customFieldText(false), "0");
  assert.equal(customFieldText(null), "");
  assert.equal(
    evaluateCustomField(SCENE_FIELDS, "Archived", "EQUALS", "1"),
    true,
  );
  assert.equal(
    evaluateCustomField({ Archived: true }, "Archived", "EQUALS", "1"),
    true,
  );
});

test("normalizeScene keeps custom field values at their original type", () => {
  const view = normalizeScene({
    custom_fields: { Episode: 3, Series: "Anita's Adventures" },
    performers: [
      { id: "p1", name: "Amy", custom_fields: { Agency: "Talent Co" } },
    ],
  });
  assert.equal(view.customFields.Episode, 3);
  assert.deepEqual(view.performers[0].customFields, { Agency: "Talent Co" });
  // absent rather than null, so nothing has to guard every lookup
  assert.deepEqual(normalizeScene({}).customFields, {});
  assert.deepEqual(
    normalizeScene({ performers: [{ id: "p" }] }).performers[0].customFields,
    {},
  );
});

test("the conditions reach the right map", () => {
  const view = normalizeScene({
    custom_fields: { Series: "Anita's Adventures" },
    performers: [
      { id: "p1", name: "Amy", custom_fields: { Agency: "Talent Co" } },
    ],
    studio: {
      id: "s1",
      name: "Leaf Studio",
      custom_fields: { Network: "Betty Files" },
    },
  });
  const own = {
    field: "custom_field",
    key: "Series",
    op: "EQUALS",
    value: "Anita's Adventures",
  };
  const theirs = {
    field: "performer",
    op: "custom_field",
    key: "Agency",
    valueOp: "EQUALS",
    value: "Talent Co",
  };
  const studios = {
    field: "studio",
    op: "custom_field",
    key: "Network",
    valueOp: "EQUALS",
    value: "Betty Files",
  };
  assert.equal(evaluateCondition(view, own), true);
  assert.equal(evaluateCondition(view, theirs), true);
  assert.equal(evaluateCondition(view, studios), true);
  // the item's own map, its performers' and its studio's are never the same map
  assert.equal(
    evaluateCondition(view, { ...own, key: "Agency", value: "Talent Co" }),
    false,
  );
  assert.equal(
    evaluateCondition(view, {
      ...theirs,
      key: "Series",
      value: "Anita's Adventures",
    }),
    false,
  );
  assert.equal(evaluateCondition(view, { ...studios, key: "Series" }), false);
});

test("a studio custom field condition asks about the scene's own (leaf) studio, not an ancestor", () => {
  const view = normalizeScene({
    studio: {
      id: "s-leaf",
      name: "Leaf Studio",
      custom_fields: { Network: "Leaf's Own" },
      parent_studio: {
        id: "s-parent",
        name: "Parent Co",
        custom_fields: { Network: "Parent's Own" },
      },
    },
  });
  assert.equal(
    evaluateCondition(view, {
      field: "studio",
      op: "custom_field",
      key: "Network",
      valueOp: "EQUALS",
      value: "Leaf's Own",
    }),
    true,
  );
  assert.equal(
    evaluateCondition(view, {
      field: "studio",
      op: "custom_field",
      key: "Network",
      valueOp: "EQUALS",
      value: "Parent's Own",
    }),
    false,
  );
});

test("a matched condition says which field and how", () => {
  const view = normalizeScene({ custom_fields: { Series: "Betty Files" } });
  assert.equal(
    describeCondition(view, {
      field: "custom_field",
      key: "Series",
      op: "INCLUDES",
      value: "Betty",
    }),
    "custom field \"Series\" contains 'Betty'",
  );
  // a presence op has no value to quote
  assert.equal(
    describeCondition(view, {
      field: "custom_field",
      key: "Series",
      op: "NOT_NULL",
    }),
    'custom field "Series" is set',
  );
});

test("a matched studio custom field condition names the studio", () => {
  const view = normalizeScene({
    studio: { id: "s1", name: "Leaf Studio", custom_fields: {} },
  });
  assert.equal(
    describeCondition(view, {
      field: "studio",
      op: "custom_field",
      key: "Network",
      valueOp: "INCLUDES",
      value: "Betty",
    }),
    "studio 'Leaf Studio'’s custom field \"Network\" contains 'Betty'",
  );
  // no studio at all: falls back to a generic phrasing rather than quoting ''
  assert.equal(
    describeCondition(normalizeScene({}), {
      field: "studio",
      op: "custom_field",
      key: "Network",
      valueOp: "NOT_NULL",
    }),
    'the studio’s custom field "Network" is set',
  );
});

test("a custom field condition becomes the criterion Stash takes", () => {
  assert.deepEqual(
    ruleToSceneFilter({
      conditions: [
        { field: "custom_field", key: "Episode", op: "EQUALS", value: "3" },
      ],
    }),
    {
      custom_fields: [
        { field: "Episode", modifier: "EQUALS", value: ["3", 3] },
      ],
    },
  );
  assert.deepEqual(
    ruleToSceneFilter({
      conditions: [
        { field: "custom_field", key: "Series", op: "IS_NULL", value: "" },
      ],
    }),
    { custom_fields: [{ field: "Series", modifier: "IS_NULL" }] },
  );
});

test("a studio custom field condition becomes a studios_filter criterion", () => {
  assert.deepEqual(
    ruleToSceneFilter({
      conditions: [
        {
          field: "studio",
          op: "custom_field",
          key: "Network",
          valueOp: "EQUALS",
          value: "Indie",
        },
      ],
    }),
    {
      studios_filter: {
        custom_fields: [
          { field: "Network", modifier: "EQUALS", value: ["Indie"] },
        ],
      },
    },
  );
});

// A rule that cannot be turned into a filter is unpreviewable, which is loud.
// One that quietly turned into no criterion at all would silently claim every
// item in the library, which is not
test("an unnamed or valueless custom field condition refuses to become a filter", () => {
  assert.equal(
    ruleToSceneFilter({
      conditions: [
        { field: "custom_field", key: "", op: "EQUALS", value: "3" },
      ],
    }),
    null,
  );
  assert.equal(
    ruleToSceneFilter({
      conditions: [
        { field: "custom_field", key: "Episode", op: "EQUALS", value: "" },
      ],
    }),
    null,
  );
});

test("{@...} parses to the custom_field token carrying the name", () => {
  const [token] = scanPattern("{@Series}");
  assert.equal(token.name, "custom_field");
  assert.equal(token.arg, "Series");
  assert.deepEqual(token.errors, []);
  assert.equal(token.raw, "{@Series}");
});

test("a custom field name may contain the spaces real ones have", () => {
  assert.equal(scanPattern("{@Release Group}")[0].arg, "Release Group");
  // and is trimmed, so a stray space does not become part of the name
  assert.equal(scanPattern("{@ Release Group }")[0].arg, "Release Group");
});

test("{@...} composes with ? and with modifiers like any other token", () => {
  const optional = scanPattern("{@Episode?}")[0];
  assert.equal(optional.arg, "Episode");
  assert.equal(optional.optional, true);

  const modified = scanPattern("{@Series|uppercase}")[0];
  assert.equal(modified.arg, "Series");
  assert.equal(modified.optional, false);
  assert.deepEqual(
    modified.modifiers.map((m) => m.name),
    ["uppercase"],
  );

  const both = scanPattern("{@Release Group|lowercase?}")[0];
  assert.equal(both.arg, "Release Group");
  assert.equal(both.optional, true);
});

test("{@} with no name is reported rather than rendered as nothing", () => {
  const [token] = scanPattern("{@}");
  assert.equal(token.arg, "");
  assert.equal(token.errors.length, 1);
  assert.match(token.errors[0], /needs the name of a custom field/);
  // an errored token renders as the text that was written, like any other
  assert.equal(renderTemplate("{@}", tokensFor({})), "{@}");
});

function tokensFor(customFields) {
  return buildTokens(
    { studioNames: [], performers: [], tags: [], customFields },
    {},
    null,
  );
}

test("the token renders the named field and nothing else", () => {
  const tokens = tokensFor(SCENE_FIELDS);
  assert.equal(renderTemplate("{@Series}", tokens), "Anita's Adventures");
  // a number reads as its digits
  assert.equal(renderTemplate("{@Episode}", tokens), "3");
  // and a field this item does not have is empty, not an exception
  assert.equal(renderTemplate("{@Nope}", tokens), "");
});

test("a rendered custom field is sanitised like any other token value", () => {
  const tokens = tokensFor({ Series: "Anita: Part 1/2" });
  assert.equal(renderTemplate("{@Series}", tokens), "Anita Part 1 2");
});

test("value modifiers apply to a custom field", () => {
  const tokens = tokensFor(SCENE_FIELDS);
  assert.equal(
    renderTemplate("{@Series|uppercase}", tokens),
    "ANITA'S ADVENTURES",
  );
  assert.equal(
    renderTemplate("{@Series|regex=/Anita's /Anitas /}", tokens),
    "Anitas Adventures",
  );
});

test("an empty custom field collapses its <...> group", () => {
  const tokens = tokensFor(SCENE_FIELDS);
  assert.equal(renderTemplate("x< [{@Nope?}]>", tokens), "x");
  assert.equal(
    renderTemplate("x< [{@Series?}]>", tokens),
    "x [Anita's Adventures]",
  );
  // and falls through to the next alternative
  assert.equal(renderTemplate("<{@Nope?}|none>", tokens), "none");
});

test("a required custom field with no value is reported by name", () => {
  const view = {
    studioNames: [],
    performers: [],
    tags: [],
    customFields: SCENE_FIELDS,
  };
  assert.deepEqual(
    findMissingRequiredData(["{@Series}"], view, null, "scene"),
    [],
  );
  const missing = findMissingRequiredData(["{@Nope}"], view, null, "scene");
  assert.equal(missing.length, 1);
  assert.equal(missing[0].token, "custom_field");
  assert.match(
    missing[0].message,
    /scene has no value for the custom field "Nope"/,
  );
  assert.deepEqual(
    findMissingRequiredData(["{@Nope?}"], view, null, "scene"),
    [],
  );
});

test("each missing custom field is reported separately", () => {
  const view = { studioNames: [], performers: [], tags: [], customFields: {} };
  const missing = findMissingRequiredData(
    ["{@One}/{@Two}"],
    view,
    null,
    "scene",
  );
  assert.deepEqual(
    missing.map((m) => m.message),
    [
      'scene has no value for the custom field "One"',
      'scene has no value for the custom field "Two"',
    ],
  );
});

test("a modifier that does not apply names the token the way it was written", () => {
  const problems = findPatternProblems("{@Series|gender=female}", KNOWN_TOKENS);
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /\{@Series\} is not one/);
  assert.equal(problems[0].blocking, true);
});

test("a well-formed {@...} token is not reported as unknown", () => {
  assert.deepEqual(
    findPatternProblems("{studio}/{@Series} - {title}", KNOWN_TOKENS),
    [],
  );
});

function tokensForStudio(customFields, studioCustomFields) {
  return buildTokens(
    {
      studioNames: [],
      performers: [],
      tags: [],
      customFields: customFields,
      studioCustomFields: studioCustomFields,
    },
    {},
    null,
  );
}

test("|from=studio reads the item's studio's custom field instead of its own", () => {
  const tokens = tokensForStudio(SCENE_FIELDS, { Series: "Studio Series" });
  assert.equal(renderTemplate("{@Series}", tokens), "Anita's Adventures");
  assert.equal(
    renderTemplate("{@Series|from=studio}", tokens),
    "Studio Series",
  );
  // a field the studio doesn't have is empty, same as the scene case
  assert.equal(renderTemplate("{@Nope|from=studio}", tokens), "");
});

test("from=studio composes with other modifiers and with ?", () => {
  const tokens = tokensForStudio({}, { Series: "studio's own" });
  assert.equal(
    renderTemplate("{@Series|from=studio|uppercase}", tokens),
    "STUDIO'S OWN",
  );
  assert.equal(
    renderTemplate("x< [{@Nope|from=studio?}]>", tokens),
    "x",
  );
  assert.equal(
    renderTemplate("<{@Nope|from=studio?}|{@Series|from=studio}>", tokens),
    "studio's own",
  );
});

test("findMissingRequiredData blames the studio, not the scene, for a from=studio field", () => {
  const view = {
    studioNames: [],
    performers: [],
    tags: [],
    customFields: SCENE_FIELDS,
    studioCustomFields: { Series: "Studio Series" },
  };
  assert.deepEqual(
    findMissingRequiredData(["{@Series|from=studio}"], view, null, "scene"),
    [],
  );
  const missing = findMissingRequiredData(
    ["{@Nope|from=studio}"],
    view,
    null,
    "scene",
  );
  assert.equal(missing.length, 1);
  assert.match(
    missing[0].message,
    /scene's studio has no value for the custom field "Nope"/,
  );
});

test("from= on a custom field only accepts studio or scene", () => {
  const bad = findPatternProblems("{@Series|from=performer}", KNOWN_TOKENS);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].blocking, true);
  assert.match(bad[0].message, /only accepts "studio"/);

  assert.deepEqual(
    findPatternProblems("{@Series|from=studio}", KNOWN_TOKENS),
    [],
  );
  // "scene" is accepted too, even though it is already the default
  assert.deepEqual(
    findPatternProblems("{@Series|from=scene}", KNOWN_TOKENS),
    [],
  );
});
