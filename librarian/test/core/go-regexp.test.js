import test from "node:test";
import assert from "node:assert/strict";
import { goRegExp } from "../../src/core/go-regexp.js";
import { evaluateStringCriterion } from "../../src/core/string-criterion.js";
import { evaluateCustomField } from "../../src/core/custom-fields.js";

// Expectations below were checked against Go's regexp package
function matches(pattern, text) {
  return goRegExp(pattern).test(text);
}

test("a leading (?i) makes the whole pattern case-insensitive, as in Stash", () => {
  assert.equal(matches("(?i)(av1|hevc|x265|h265)", "HEVC"), true);
  assert.equal(matches("(?i)HEVC", "hevc"), true);
  assert.equal(matches("HEVC", "hevc"), false);
});

test("flags apply from where they are set to the end of the enclosing group", () => {
  assert.equal(matches("a(?i)b", "aB"), true);
  assert.equal(matches("a(?i)b", "AB"), false);
  assert.equal(matches("(a(?i)b)c", "aBC"), false);
  assert.equal(matches("(a(?i)b)c", "aBc"), true);
});

test("scoped and cleared flags only cover their own part of the pattern", () => {
  assert.equal(matches("a(?i:b)c", "aBc"), true);
  assert.equal(matches("a(?i:b)c", "aBC"), false);
  assert.equal(matches("(?i)a(?-i)b", "Ab"), true);
  assert.equal(matches("(?i)a(?-i)b", "AB"), false);
});

test("(?i) folds character classes, keeping a negated class excluding both cases", () => {
  assert.equal(matches("(?i)^[a-c]+$", "AbC"), true);
  assert.equal(matches("(?i)^[^a-c]$", "B"), false);
  assert.equal(matches("(?i)ς", "Σ"), true);
});

test("the dot excludes only a newline unless (?s) is set", () => {
  assert.equal(matches("a.b", "a\rb"), true);
  assert.equal(matches("a.b", "a\nb"), false);
  assert.equal(matches("(?s)a.b", "a\nb"), true);
});

test("(?m) makes ^ and $ match at line breaks", () => {
  assert.equal(matches("^b", "a\nb"), false);
  assert.equal(matches("(?m)^b", "a\nb"), true);
  assert.equal(matches("(?m)a$", "a\nb"), true);
  assert.equal(matches("\\Ab", "a\nb"), false);
});

test("(?U) swaps greedy and lazy quantifiers", () => {
  assert.equal(goRegExp("(?U)a+").exec("aaa")[0], "a");
  assert.equal(goRegExp("(?U)a+?").exec("aaa")[0], "aaa");
  assert.equal(goRegExp("a+?").exec("aaa")[0], "a");
});

test("RE2 syntax JavaScript would misread is translated", () => {
  assert.equal(matches("^[[:alpha:]]+$", "hevc"), true);
  assert.equal(matches("[[:^alpha:]]", "hevc"), false);
  assert.equal(matches("\\x{41}", "A"), true);
  assert.equal(matches("^\\Qa.b\\E$", "axb"), false);
  assert.equal(matches("\\s", " "), false);
  assert.equal(matches("(?P<codec>hevc)", "hevc"), true);
  assert.equal(matches("[]a]", "]"), true);
});

test("a pattern RE2 rejects is rejected", () => {
  assert.throws(() => goRegExp("[a-"));
  assert.throws(() => goRegExp("[[:nonsense:]]"));
});

test("Unicode classes are refused, since the backend's VM can't match them", () => {
  assert.throws(() => goRegExp("\\pL"));
  assert.throws(() => goRegExp("[\\p{Greek}]"));
});

test("regex conditions read patterns the way Stash does", () => {
  const criterion = (modifier) => ({ modifier, value: "(?i)hevc" });
  assert.equal(
    evaluateStringCriterion("HEVC", criterion("MATCHES_REGEX")),
    true,
  );
  assert.equal(
    evaluateStringCriterion("HEVC", criterion("NOT_MATCHES_REGEX")),
    false,
  );
  assert.equal(
    evaluateCustomField(
      { codec: "HEVC" },
      "codec",
      "MATCHES_REGEX",
      "(?i)hevc",
    ),
    true,
  );
});
