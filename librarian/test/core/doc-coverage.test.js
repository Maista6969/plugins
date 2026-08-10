import test from "node:test";
import assert from "node:assert/strict";
import { KNOWN_TOKENS } from "../../src/core/path-template.js";
import { MODIFIERS } from "../../src/core/token-grammar.js";
import {
  TOKEN_DESCRIPTIONS,
  describeToken,
  describeTokens,
  describeModifiers,
} from "../../src/core/token-docs.js";

// The generator can only keep the README and the in-app reference in step with
// each other. What keeps them in step with the CODE is this: adding a token or
// a modifier without describing it fails the build rather than shipping a blank
// row that nobody notices
test("every token has a description", () => {
  const missing = KNOWN_TOKENS.filter((name) => {
    return !TOKEN_DESCRIPTIONS[name];
  });
  assert.deepEqual(missing, [], "tokens with no entry in TOKEN_DESCRIPTIONS");
});

test("no description is written for a token that does not exist", () => {
  const stale = Object.keys(TOKEN_DESCRIPTIONS).filter((name) => {
    return KNOWN_TOKENS.indexOf(name) === -1;
  });
  assert.deepEqual(stale, [], "descriptions for tokens that were removed");
});

test("every modifier has a summary and a worked example", () => {
  Object.keys(MODIFIERS).forEach((name) => {
    const spec = MODIFIERS[name];
    assert.ok(spec.summary, name + " has no summary");
    assert.ok(spec.example, name + " has no example");
    assert.ok(spec.example.pattern, name + " example has no pattern");
    assert.ok(spec.example.before, name + " example has no before");
    assert.ok(spec.example.after, name + " example has no after");
    // an example that does not mention its own modifier is a copy-paste slip
    assert.ok(
      spec.example.pattern.indexOf(name) !== -1,
      name + " example does not use " + name,
    );
  });
});

test("describeModifiers lists every registered modifier exactly once", () => {
  const described = describeModifiers().map((m) => {
    return m.name;
  });
  assert.deepEqual(described.slice().sort(), Object.keys(MODIFIERS).sort());
  assert.equal(described.length, new Set(described).size);
});

test("describeModifiers spells out whether a value is taken", () => {
  const by = {};
  describeModifiers().forEach((m) => {
    by[m.name] = m;
  });
  assert.equal(by.limit.spelling, "limit=");
  assert.equal(by.regex.spelling, "regex=");
  assert.equal(by.uppercase.spelling, "uppercase");
  assert.equal(by.limit.targets, "list tokens");
  assert.equal(by.gender.targets, "the performer tokens");
  assert.equal(by.uppercase.targets, "any token");
  assert.equal(by.from.targets, "{stash_id}");
});

test("describeToken substitutes the entity noun", () => {
  assert.match(describeToken("title", "gallery"), /gallery/);
  assert.equal(describeToken("title", "gallery").indexOf("{noun}"), -1);
  // an unknown token is empty rather than an exception, so a chip can render
  assert.equal(describeToken("nonsense", "scene"), "");
});

test("describeTokens separates file metadata from entity metadata", () => {
  const rows = describeTokens(KNOWN_TOKENS, "scene");
  const fileTech = rows
    .filter((r) => {
      return r.fileTech;
    })
    .map((r) => {
      return r.name;
    });
  assert.deepEqual(fileTech.slice().sort(), [
    "audio_codec",
    "bitrate",
    "fps",
    "oshash",
    "phash",
    "resolution",
    "video_codec",
  ]);
  rows.forEach((r) => {
    assert.ok(r.description, r.name + " rendered an empty description");
  });
});
