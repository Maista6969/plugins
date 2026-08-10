import test from "node:test";
import assert from "node:assert/strict";
import { scanPattern, splitTopLevel } from "../../src/core/token-grammar.js";

function only(pattern) {
  const tokens = scanPattern(pattern);
  assert.equal(tokens.length, 1, "expected exactly one token in " + pattern);
  return tokens[0];
}

function shape(pattern) {
  const t = only(pattern);
  return {
    name: t.name,
    optional: t.optional,
    modifiers: t.modifiers.map((m) => m.name + "=" + m.value),
    errors: t.errors.length,
  };
}

test("parses every spelling of the token grammar", () => {
  assert.deepEqual(shape("{title}"), {
    name: "title",
    optional: false,
    modifiers: [],
    errors: 0,
  });
  assert.deepEqual(shape("{title?}"), {
    name: "title",
    optional: true,
    modifiers: [],
    errors: 0,
  });
  assert.deepEqual(shape("{performers|limit=2}"), {
    name: "performers",
    optional: false,
    modifiers: ["limit=2"],
    errors: 0,
  });
  assert.deepEqual(shape("{performers|limit=2?}"), {
    name: "performers",
    optional: true,
    modifiers: ["limit=2"],
    errors: 0,
  });
  assert.deepEqual(shape("{performers|gender=female}"), {
    name: "performers",
    optional: false,
    modifiers: ["gender=female"],
    errors: 0,
  });
  assert.deepEqual(shape("{performers|gender=female|limit=1?}"), {
    name: "performers",
    optional: true,
    modifiers: ["gender=female", "limit=1"],
    errors: 0,
  });
  assert.deepEqual(shape("{performers|gender=female,trans_female}"), {
    name: "performers",
    optional: false,
    modifiers: ["gender=female,trans_female"],
    errors: 0,
  });
  assert.deepEqual(shape("{title|uppercase}"), {
    name: "title",
    optional: false,
    modifiers: ["uppercase=null"],
    errors: 0,
  });
});

// ":N" sits at the front of the token, and the front is where a left-to-right
// limit runs, so the sugar is exactly a leading |limit=N
test(":N desugars to a leading limit modifier, with a deprecation warning", () => {
  assert.deepEqual(only("{performers:2}").modifiers, [
    { name: "limit", value: "2", raw: ":2" },
  ]);
  assert.deepEqual(
    only("{performers:1|gender=female}").modifiers.map((m) => m.name),
    ["limit", "gender"],
  );
  const warnings = only("{performers:1|gender=female}").warnings;
  assert.equal(warnings.length, 1);
  // the warning has to print the rewrite, including the rest of the modifiers
  assert.match(warnings[0], /\{performers\|limit=1\|gender=female\}/);
  assert.equal(only("{performers|limit=2}").warnings.length, 0);
});

test("modifiers keep the order they were written", () => {
  assert.deepEqual(
    only("{performers|limit=2|gender=female}").modifiers.map((m) => m.name),
    ["limit", "gender"],
  );
  assert.deepEqual(
    only("{performers|gender=female|limit=2}").modifiers.map((m) => m.name),
    ["gender", "limit"],
  );
  assert.deepEqual(
    only("{title|compact|lowercase}").modifiers.map((m) => m.name),
    ["compact", "lowercase"],
  );
});

// these used to be grammar errors when limit was folded in while parsing; they
// are ordinary modifier problems now, and findPatternProblems reports them
test("a bad limit is no longer a parse error, just a modifier", () => {
  assert.deepEqual(only("{performers|limit=abc}").errors, []);
  assert.deepEqual(only("{performers:2|limit=3}").errors, []);
  assert.deepEqual(
    only("{performers:2|limit=3}").modifiers.map((m) => m.name),
    ["limit", "limit"],
  );
});

test("scans several tokens and reports where each one starts", () => {
  const tokens = scanPattern("{studio}/{date} - {title}");
  assert.deepEqual(
    tokens.map((t) => t.name),
    ["studio", "date", "title"],
  );
  assert.deepEqual(
    tokens.map((t) => t.index),
    [0, 9, 18],
  );
  assert.deepEqual(
    tokens.map((t) => t.raw),
    ["{studio}", "{date}", "{title}"],
  );
});

test("malformed token bodies produce errors rather than throwing", () => {
  assert.ok(only("{foo bar}").errors.length > 0);
  assert.ok(only("{performers|}").errors.length > 0);
  assert.ok(only("{performers:x}").errors.length > 0);
  // the ? has to come last; flagging it is better than silently ignoring it
  assert.ok(only("{performers?|gender=female}").errors.length > 0);
});

test("a bare modifier with no value parses, leaving the value null", () => {
  const token = only("{performers|gender}");
  assert.equal(token.errors.length, 0);
  assert.deepEqual(token.modifiers, [
    { name: "gender", value: null, raw: "gender" },
  ]);
});

test("text with no tokens scans to nothing", () => {
  assert.deepEqual(scanPattern("just literal text"), []);
  assert.deepEqual(scanPattern(""), []);
  assert.deepEqual(scanPattern(null), []);
});

test("splitTopLevel ignores separators nested inside braces", () => {
  // the whole reason the modifier separator can coexist with <a|b> alternatives
  assert.deepEqual(splitTopLevel("{performers|gender=female}|no women", "|"), [
    "{performers|gender=female}",
    "no women",
  ]);
  assert.deepEqual(splitTopLevel("{code?}|{date?}|xxx", "|"), [
    "{code?}",
    "{date?}",
    "xxx",
  ]);
  assert.deepEqual(splitTopLevel("no separators here", "|"), [
    "no separators here",
  ]);
  assert.deepEqual(splitTopLevel("|leading", "|"), ["", "leading"]);
  assert.deepEqual(splitTopLevel("trailing|", "|"), ["trailing", ""]);
  // an unbalanced brace must not swallow the rest of the pattern
  assert.deepEqual(splitTopLevel("{unclosed|b", "|"), ["{unclosed|b"]);
  assert.deepEqual(splitTopLevel("closed}|b", "|"), ["closed}", "b"]);
});

// A regex value is an opaque span: the separator, the optional marker and the
// braces of a {2} quantifier all have to survive tokenizing
test("a regex= value can contain |, ? and braces", () => {
  const pipe = only("{title|regex=/(a|b)/X/}");
  assert.deepEqual(pipe.errors, []);
  assert.deepEqual(pipe.modifiers, [
    { name: "regex", value: "/(a|b)/X/", raw: "regex=/(a|b)/X/" },
  ]);

  const braces = only("{date|regex=/(\\d{4}).*/$1/}");
  assert.equal(braces.name, "date");
  assert.deepEqual(braces.errors, []);
  assert.equal(braces.modifiers[0].value, "/(\\d{4}).*/$1/");

  // the value always ends in "/", so a trailing ? is unambiguously the marker
  const optional = only("{title|regex=/a?/X/?}");
  assert.equal(optional.optional, true);
  assert.equal(optional.modifiers[0].value, "/a?/X/");
  assert.equal(only("{title|regex=/a/X/}").optional, false);
});

test("a regex= value composes with other modifiers in written order", () => {
  assert.deepEqual(
    only("{title|regex=/(a|b)/X/|uppercase}").modifiers.map((m) => m.name),
    ["regex", "uppercase"],
  );
  assert.deepEqual(
    only("{performers|uppercase|regex=/ /_/|limit=2}").modifiers.map(
      (m) => m.name,
    ),
    ["uppercase", "regex", "limit"],
  );
});

test("scanning still refuses nested tokens and survives stray braces", () => {
  assert.deepEqual(
    scanPattern("{title{studio}}").map((t) => t.name),
    ["studio"],
  );
  assert.deepEqual(
    scanPattern("{unclosed").map((t) => t.name),
    [],
  );
  assert.deepEqual(
    scanPattern("a{b").map((t) => t.name),
    [],
  );
  // an unterminated regex value must not swallow the rest of the pattern
  assert.deepEqual(
    scanPattern("{title|regex=/oops} - {studio}").map((t) => t.name),
    ["title", "studio"],
  );
});
