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
    limit: t.limit,
    optional: t.optional,
    modifiers: t.modifiers.map((m) => m.name + "=" + m.value),
    errors: t.errors.length,
  };
}

test("parses every spelling of the token grammar", () => {
  assert.deepEqual(shape("{title}"), {
    name: "title",
    limit: null,
    optional: false,
    modifiers: [],
    errors: 0,
  });
  assert.deepEqual(shape("{performers:2}"), {
    name: "performers",
    limit: 2,
    optional: false,
    modifiers: [],
    errors: 0,
  });
  assert.deepEqual(shape("{title?}"), {
    name: "title",
    limit: null,
    optional: true,
    modifiers: [],
    errors: 0,
  });
  assert.deepEqual(shape("{performers:2?}"), {
    name: "performers",
    limit: 2,
    optional: true,
    modifiers: [],
    errors: 0,
  });
  assert.deepEqual(shape("{performers|thing=value}"), {
    name: "performers",
    limit: null,
    optional: false,
    modifiers: ["thing=value"],
    errors: 0,
  });
  assert.deepEqual(shape("{performers:1|thing=value?}"), {
    name: "performers",
    limit: 1,
    optional: true,
    modifiers: ["thing=value"],
    errors: 0,
  });
});

// limit is the named spelling of the original :N, so it is folded into
// token.limit rather than left as a registry modifier
test(":N and |limit=N are the same thing", () => {
  assert.equal(only("{performers:2}").limit, 2);
  assert.equal(only("{performers|limit=2}").limit, 2);
  assert.deepEqual(only("{performers|limit=2}").modifiers, []);
  assert.deepEqual(
    only("{performers|thing=value|limit=2}").modifiers.map((m) => m.name),
    ["thing"],
  );
  assert.equal(only("{performers|thing=value|limit=2}").limit, 2);
});

test("a limit that is not a whole number, or set twice, is an error", () => {
  assert.ok(only("{performers|limit=abc}").errors.length > 0);
  assert.ok(only("{performers|limit}").errors.length > 0);
  assert.ok(only("{performers:2|limit=3}").errors.length > 0);
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
  assert.ok(only("{performers?|thing=value}").errors.length > 0);
});

test("a bare modifier with no value parses, leaving the value null", () => {
  const token = only("{performers|thing}");
  assert.equal(token.errors.length, 0);
  assert.deepEqual(token.modifiers, [
    { name: "thing", value: null, raw: "thing" },
  ]);
});

test("text with no tokens scans to nothing", () => {
  assert.deepEqual(scanPattern("just literal text"), []);
  assert.deepEqual(scanPattern(""), []);
  assert.deepEqual(scanPattern(null), []);
});

test("splitTopLevel ignores separators nested inside braces", () => {
  // the whole reason the modifier separator can coexist with <a|b> alternatives
  assert.deepEqual(splitTopLevel("{performers|thing=value}|no women", "|"), [
    "{performers|thing=value}",
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
