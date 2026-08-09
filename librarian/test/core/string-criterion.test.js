import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateStringCriterion,
  matchesAnyPath,
  pathSearchTerms,
} from "../../src/core/string-criterion.js";

const HAPPY = "/data/Marcus Chen/Happy Hour [sdb-8+tpdb-8].mp4";
const REUNION = "/data/Marcus Chen/Friends Reunion [sdb-7+tpdb-7].mp4";

function includes(path, value) {
  return evaluateStringCriterion(path, { modifier: "INCLUDES", value: value });
}

function excludes(path, value) {
  return evaluateStringCriterion(path, { modifier: "EXCLUDES", value: value });
}

test("INCLUDES matches each word on its own, so a two-word value selects paths holding only one of them", () => {
  assert.equal(includes(HAPPY, "Happy Reunion"), true);
  assert.equal(includes(REUNION, "Happy Reunion"), true);
  assert.equal(includes(HAPPY, "Happy Hour"), true);
  assert.equal(
    includes("/data/Nebula/City Nights.mp4", "Happy Reunion"),
    false,
  );
});

test("wrapping the value in double quotes matches the whole phrase instead", () => {
  assert.equal(includes(HAPPY, '"Happy Reunion"'), false);
  assert.equal(includes(REUNION, '"Happy Reunion"'), false);
  assert.equal(includes(HAPPY, '"Happy Hour"'), true);
});

test("EXCLUDES is the negation of the same word matching: a path holding any one word is out", () => {
  assert.equal(excludes(HAPPY, "Happy Reunion"), false);
  assert.equal(excludes(REUNION, "Happy Reunion"), false);
  assert.equal(excludes("/data/Nebula/City Nights.mp4", "Happy Reunion"), true);
  // quoting narrows it back to the phrase, which neither path contains
  assert.equal(excludes(HAPPY, '"Happy Reunion"'), true);
});

test("% and _ are LIKE wildcards, because Stash compares paths with LIKE", () => {
  assert.equal(includes(HAPPY, "Happy_Hour"), true);
  assert.equal(includes(HAPPY, "Happy%Hour"), true);
  // a dot is not a wildcard, which is what tells LIKE apart from a regex
  assert.equal(includes(HAPPY, "Happy.Hour"), false);
});

test("case folding is ASCII-only, exactly as SQLite's LIKE", () => {
  const bjork = "/data/Testbed/BJÖRK Straße.mp4";
  assert.equal(includes(bjork, "BJÖRK"), true);
  assert.equal(includes(bjork, "bjÖrk"), true, "ASCII letters fold");
  assert.equal(includes(bjork, "björk"), false, "Ö and ö do not fold");
  assert.equal(includes(bjork, "STRAßE"), true);
  assert.equal(includes(bjork, "STRASSE"), false);
  assert.equal(includes(bjork, "casefold"), false);
  assert.equal(includes("/data/CaseFold/x.mp4", "casefold"), true);
});

test("surrounding whitespace and repeated spaces between words are ignored", () => {
  assert.equal(includes(HAPPY, " Happy "), true);
  assert.deepEqual(pathSearchTerms("Happy  Reunion"), ["Happy", "Reunion"]);
  assert.deepEqual(pathSearchTerms("Happy\tHour"), ["Happy", "Hour"]);
});

test("an all-whitespace value collapses to one empty term, which every path matches", () => {
  assert.deepEqual(pathSearchTerms("   "), [""]);
  assert.equal(includes(HAPPY, "   "), true);
  // and so its negation matches nothing
  assert.equal(excludes(HAPPY, "   "), false);
});

test("EQUALS compares the whole path with no wildcards added, but honours any inside the value", () => {
  assert.equal(
    evaluateStringCriterion(HAPPY, { modifier: "EQUALS", value: HAPPY }),
    true,
  );
  assert.equal(
    evaluateStringCriterion(HAPPY, {
      modifier: "EQUALS",
      value: "Happy Hour",
    }),
    false,
  );
  assert.equal(
    evaluateStringCriterion(HAPPY, {
      modifier: "EQUALS",
      value: "%Happy Hour%",
    }),
    true,
  );
});

test("EQUALS does not split on whitespace or honour quoting, unlike INCLUDES", () => {
  assert.equal(
    evaluateStringCriterion(HAPPY, {
      modifier: "EQUALS",
      value: '"' + HAPPY + '"',
    }),
    false,
  );
});

test("regex modifiers stay real regexes, which is how a user opts out of LIKE entirely", () => {
  assert.equal(
    evaluateStringCriterion(HAPPY, {
      modifier: "MATCHES_REGEX",
      value: "Happy.Hour",
    }),
    true,
  );
  assert.equal(
    evaluateStringCriterion(HAPPY, {
      modifier: "NOT_MATCHES_REGEX",
      value: "^/data/Nebula/",
    }),
    true,
  );
  // an unparseable regex matches nothing rather than throwing mid-sweep
  assert.equal(
    evaluateStringCriterion(HAPPY, {
      modifier: "MATCHES_REGEX",
      value: "[unclosed",
    }),
    false,
  );
});

test("matchesAnyPath matches when any one file qualifies, so an entity with no files never does", () => {
  const criterion = { modifier: "INCLUDES", value: "Happy Hour" };
  assert.equal(matchesAnyPath([REUNION, HAPPY], criterion), true);
  assert.equal(matchesAnyPath([REUNION], criterion), false);
  assert.equal(matchesAnyPath([], criterion), false);
  // including for a negated one: there is no file to satisfy it
  assert.equal(
    matchesAnyPath([], { modifier: "EXCLUDES", value: "anything" }),
    false,
  );
});
