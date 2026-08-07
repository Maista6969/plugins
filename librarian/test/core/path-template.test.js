import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTokens,
  renderTemplate,
  renderPath,
  sanitizeSegment,
  sanitizeTokenValue,
  findUnknownTokens,
  findMissingRequiredData,
  hasUnsafeOptionalOnlyBasename,
  joinPath,
  patternUsesAnyToken,
  PERFORMER_SORT_TOKENS,
} from "../../src/core/path-template.js";
import { normalizeConfig } from "../../src/core/config-schema.js";

function sceneView(overrides) {
  const merged = Object.assign(
    {
      id: "1",
      title: "My Title",
      date: "2024-03-05",
      organized: true,
      studioNames: ["Root", "Parent", "Leaf"],
      performerNames: ["Amy", "Zed"],
      tagNames: ["Rock", "Pop"],
      files: [],
    },
    overrides,
  );
  if (!overrides || !overrides.performers) {
    merged.performers = merged.performerNames.map(function (name, i) {
      return {
        id: (merged.performerIds && merged.performerIds[i]) || name,
        name: name,
        favorite: false,
        rating100: null,
      };
    });
  }
  if (!overrides || !overrides.tags) {
    merged.tags = merged.tagNames.map(function (name, i) {
      return { id: (merged.tagIds && merged.tagIds[i]) || name, name: name };
    });
  }
  return merged;
}

function render(pattern, view, configOverrides, matchedIds) {
  const config = normalizeConfig(configOverrides || {});
  const tokens = buildTokens(view, config, matchedIds);
  return renderTemplate(pattern, tokens);
}

test("every documented token substitutes correctly", () => {
  const view = sceneView();
  assert.equal(render("{studio}", view), "Leaf");
  assert.equal(render("{studio_root}", view), "Root");
  assert.equal(render("{studio_hierarchy}", view), "Root/Parent/Leaf");
  assert.equal(render("{performers}", view), "Amy, Zed");
  assert.equal(render("{tags}", view), "Pop, Rock");
  assert.equal(render("{title}", view), "My Title");
  assert.equal(render("{code}", sceneView({ code: "ABC-123" })), "ABC-123");
  assert.equal(render("{date}", view), "2024-03-05");
  assert.equal(render("{date_year}", view), "2024");
  assert.equal(render("{date_month}", view), "03");
  assert.equal(render("{date_day}", view), "05");
});

test("Stash's partial dates (YYYY or YYYY-MM) still yield whatever precision they actually have", () => {
  const yearOnly = sceneView({ date: "2017" });
  assert.equal(render("{date_year}", yearOnly), "2017");
  assert.equal(render("{date_month}", yearOnly), "");
  assert.equal(render("{date_day}", yearOnly), "");

  const yearMonth = sceneView({ date: "2017-06" });
  assert.equal(render("{date_year}", yearMonth), "2017");
  assert.equal(render("{date_month}", yearMonth), "06");
  assert.equal(render("{date_day}", yearMonth), "");

  const full = sceneView({ date: "2017-06-15" });
  assert.equal(render("{date_year}", full), "2017");
  assert.equal(render("{date_month}", full), "06");
  assert.equal(render("{date_day}", full), "15");
});

test("findMissingRequiredData judges date_year/date_month/date_day independently against a partial date", () => {
  const yearOnly = sceneView({ date: "2017" });
  assert.deepEqual(findMissingRequiredData(["{date_year}"], yearOnly), []);
  assert.deepEqual(
    findMissingRequiredData(["{date_month}"], yearOnly).map((m) => m.token),
    ["date_month"],
  );
  assert.deepEqual(
    findMissingRequiredData(["{date_day}"], yearOnly).map((m) => m.token),
    ["date_day"],
  );

  const yearMonth = sceneView({ date: "2017-06" });
  assert.deepEqual(findMissingRequiredData(["{date_year}"], yearMonth), []);
  assert.deepEqual(findMissingRequiredData(["{date_month}"], yearMonth), []);
  assert.deepEqual(
    findMissingRequiredData(["{date_day}"], yearMonth).map((m) => m.token),
    ["date_day"],
  );
});

test("performers_not_in_title excludes performers named in the scene title", () => {
  const view = sceneView({
    title: "A Day in the Park with Joy",
    performerNames: ["Amy", "Joy"],
  });
  assert.equal(render("{performers_not_in_title}", view), "Amy");
  assert.equal(render("{performers}", view), "Amy, Joy");
});

test("performers_not_in_title matches case-insensitively", () => {
  const view = sceneView({
    title: "party with JOY tonight",
    performerNames: ["Amy", "Joy"],
  });
  assert.equal(render("{performers_not_in_title}", view), "Amy");
});

test("multi-value tokens use a configurable delimiter", () => {
  const view = sceneView();
  assert.equal(
    render("{performers}", view, { delimiters: { performers: " & " } }),
    "Amy & Zed",
  );
  assert.equal(
    render("{tags}", view, { delimiters: { tags: "; " } }),
    "Pop; Rock",
  );
});

test("{tags} always sorts alphabetically regardless of config.sortBy", () => {
  const view = sceneView({
    tagNames: ["Zed Tag", "Amy Tag"],
    tags: [
      { id: "t1", name: "Zed Tag", favorite: true },
      { id: "t2", name: "Amy Tag", favorite: false },
    ],
  });
  // If sortBy leaked into tag ordering then "favorite_first" would put
  // "Zed Tag" first: it must still come out plain alphabetical ("Amy Tag" first)
  assert.equal(
    render("{tags}", view, { sortBy: "favorite_first" }),
    "Amy Tag, Zed Tag",
  );
  assert.equal(
    render("{tags}", view, { sortBy: "rating" }),
    "Amy Tag, Zed Tag",
  );
});

test("list tokens accept a :N count parameter to limit how many are joined", () => {
  const view = sceneView({ performerNames: ["Amy", "Bo", "Cleo", "Dee"] });
  assert.equal(render("{performers}", view), "Amy, Bo, Cleo, Dee");
  assert.equal(render("{performers:1}", view), "Amy");
  assert.equal(render("{performers:2}", view), "Amy, Bo");
  assert.equal(render("{performers:99}", view), "Amy, Bo, Cleo, Dee");
});

test("tokens with no underlying data render as empty strings from buildTokens", () => {
  const view = sceneView({ studioNames: [], date: "", title: "" });
  assert.equal(render("{studio}", view), "");
  assert.equal(render("{date}", view), "");
  assert.equal(render("{title}", view), "");
});

test("studio_hierarchy is just the studio name when there's no parent network", () => {
  const view = sceneView({ studioNames: ["OnlyOne"] });
  assert.equal(render("{studio}", view), "OnlyOne");
  assert.equal(render("{studio_hierarchy}", view), "OnlyOne");
});

test("{field?} renders empty rather than leaving literal text when data is missing", () => {
  const view = sceneView({ studioNames: [] });
  assert.equal(render("{studio?}", view), "");
  assert.deepEqual(findMissingRequiredData(["{studio?}"], view), []);
});

test("renderTemplate leaves unknown tokens untouched rather than silently emptying them", () => {
  const result = renderTemplate("{studio}/{bogus}/{title}", {
    studio: "S",
    title: "T",
  });
  assert.equal(result, "S/{bogus}/T");
});

test("findUnknownTokens reports tokens not in KNOWN_TOKENS, ignoring :N and ? suffixes", () => {
  assert.deepEqual(findUnknownTokens("{studio}/{bogus}/{title}"), ["bogus"]);
  assert.deepEqual(findUnknownTokens("{studio}/{title}"), []);
  assert.deepEqual(findUnknownTokens("{performers:3}/{studio?}"), []);
  assert.deepEqual(findUnknownTokens("{studio_parent}"), ["studio_parent"]);
});

test("patternUsesAnyToken detects any of the given tokens, ignoring :N and ? suffixes", () => {
  assert.equal(
    patternUsesAnyToken("{studio}/{performers}", PERFORMER_SORT_TOKENS),
    true,
  );
  assert.equal(
    patternUsesAnyToken(
      "{studio}/{performers_not_in_title:2?}",
      PERFORMER_SORT_TOKENS,
    ),
    true,
  );
  assert.equal(
    patternUsesAnyToken("{matched_performers?}", PERFORMER_SORT_TOKENS),
    true,
  );
  assert.equal(
    patternUsesAnyToken("{studio}/{tags}/{title}", PERFORMER_SORT_TOKENS),
    false,
  );
  assert.equal(patternUsesAnyToken("", PERFORMER_SORT_TOKENS), false);
  assert.equal(patternUsesAnyToken(undefined, PERFORMER_SORT_TOKENS), false);
});

test("a tag value containing '/' does not inject extra folder nesting", () => {
  const config = normalizeConfig({});
  const view = sceneView({ tagNames: ["Rock/Pop"], studioNames: [] });
  const { folder, basenameNoExt } = renderPath(
    "{tags}",
    "{title}",
    view,
    config,
  );
  // The "/" inside the tag value must have been stripped/replaced BEFORE
  // substitution, so it must not appear as a literal path separator here.
  assert.equal(folder, "Rock Pop");
  assert.equal(basenameNoExt, "My Title");
});

test("sanitizeSegment strips illegal characters", () => {
  assert.equal(sanitizeSegment('a<b>c:d"e?f*g|h'), "a b c d e f g h");
});

test("sanitizeSegment trims trailing dots and spaces", () => {
  assert.equal(sanitizeSegment("Season 1.  "), "Season 1");
});

test("sanitizeSegment disarms reserved Windows device names", () => {
  assert.equal(sanitizeSegment("CON"), "CON_");
  assert.equal(sanitizeSegment("con"), "con_");
  assert.equal(sanitizeSegment("COM1"), "COM1_");
  assert.equal(sanitizeSegment("NotReserved"), "NotReserved");
});

test("spaceReplacement replaces interior spaces, leaving leading/trailing whitespace trimmed exactly as before", () => {
  assert.equal(
    sanitizeSegment("My Title", { spaceReplacement: "." }),
    "My.Title",
  );
  assert.equal(
    sanitizeSegment("My Title", { spaceReplacement: "_" }),
    "My_Title",
  );
  assert.equal(
    sanitizeSegment("  My Title  ", { spaceReplacement: "." }),
    "My.Title",
  );
  assert.equal(sanitizeSegment("My Title", {}), "My Title");
});

test("spaceReplacement runs BEFORE the reserved-device-name check, so a replacement that CREATES a collision is still caught", () => {
  assert.equal(sanitizeSegment("CON 1", { spaceReplacement: "." }), "CON_.1");
  assert.equal(sanitizeSegment("CON 1", {}), "CON 1");
});

test("renderPath flags basenameHasContent false when every token is optional and none has data — the dangerous 'generic _ placeholder' case", () => {
  const config = normalizeConfig({});
  const view = sceneView({
    title: "",
    studioNames: [],
    performerNames: [],
    tagNames: [],
  });
  const rendered = renderPath(
    "{studio?}",
    "<{title?}> <{performers?}>",
    view,
    config,
  );
  assert.equal(rendered.basenameNoExt, "_");
  assert.equal(rendered.basenameHasContent, false);
});

test("renderPath still collapses a blank leading folder segment within a multi-level folder pattern, keeping the surviving one", () => {
  const config = normalizeConfig({});
  const view = sceneView({ studioNames: [] });
  const rendered = renderPath("{studio?}/FixedFolder", "{title}", view, config);
  assert.equal(rendered.folder, "FixedFolder");
  assert.equal(rendered.basenameNoExt, "My Title");
  assert.equal(rendered.basenameHasContent, true);
});

test("hasUnsafeOptionalOnlyBasename flags a filenamePattern with at least one token where ALL of them are optional'", () => {
  assert.equal(
    hasUnsafeOptionalOnlyBasename("[UNCENSORED] {date?} - {title?}"),
    true,
  );
  assert.equal(hasUnsafeOptionalOnlyBasename("{title?}"), true);
  assert.equal(
    hasUnsafeOptionalOnlyBasename("{performers_not_in_title:2?}"),
    true,
  );
});

test("hasUnsafeOptionalOnlyBasename allows a filenamePattern with at least one REQUIRED token, whatever else is optional alongside it", () => {
  assert.equal(hasUnsafeOptionalOnlyBasename("{date?} - {title}"), false);
});

test("hasUnsafeOptionalOnlyBasename allows a filenamePattern with no tokens at all", () => {
  assert.equal(hasUnsafeOptionalOnlyBasename("FixedName"), false);
  assert.equal(hasUnsafeOptionalOnlyBasename(""), false);
});

test("renderPath flags basenameHasContent false when the filename's content is entirely characters sanitization strips", () => {
  const config = normalizeConfig({});
  const view = sceneView({ title: "???", studioNames: [] });
  const rendered = renderPath("", "{title}", view, config);
  assert.equal(rendered.basenameNoExt, "_");
  assert.equal(rendered.basenameHasContent, false);
});

test("renderPath flags basenameHasContent true for a real, non-empty basename", () => {
  const config = normalizeConfig({});
  const view = sceneView({ title: "_", studioNames: [] });
  const rendered = renderPath("", "{title}", view, config);
  assert.equal(rendered.basenameNoExt, "_");
  assert.equal(rendered.basenameHasContent, true);
});

test("renderPath flags basenameHasMetadataContent false when the basename is built entirely from file-tech tokens on a scene with no Stash metadata at all", () => {
  const config = normalizeConfig({});
  const view = sceneView({
    title: "",
    date: "",
    studioNames: [],
    performerNames: [],
    tagNames: [],
    resolution: "4k",
    videoCodec: "hevc",
  });
  const rendered = renderPath("", "{video_codec} {resolution}", view, config);
  assert.equal(rendered.basenameHasContent, true);
  assert.equal(rendered.basenameHasMetadataContent, false);
});

test("renderPath flags basenameHasMetadataContent true as soon as ANY metadata token contributes, even mixed with file-tech tokens", () => {
  const config = normalizeConfig({});
  const view = sceneView({
    title: "My Title",
    date: "",
    studioNames: [],
    performerNames: [],
    tagNames: [],
    resolution: "4k",
  });
  const rendered = renderPath("", "{resolution} - {title}", view, config);
  assert.equal(rendered.basenameHasMetadataContent, true);
});

test("renderPath flags basenameHasMetadataContent true when the pattern has no file-tech tokens at all, regardless of content", () => {
  const config = normalizeConfig({});
  const view = sceneView({ studioNames: [] });
  const rendered = renderPath("", "{title}", view, config);
  assert.equal(rendered.basenameHasMetadataContent, true);
});

test("sanitizeTokenValue/sanitizeSegment normalize NFC and NFD equivalently", () => {
  const nfc = "Café".normalize("NFC"); // é as a single precomposed codepoint
  const nfd = "Café".normalize("NFD"); // e + combining acute accent (U+0301)
  assert.notEqual(nfc, nfd); // sanity: they really are different strings
  assert.equal(sanitizeTokenValue(nfc), sanitizeTokenValue(nfd));
  assert.equal(sanitizeSegment(nfc), sanitizeSegment(nfd));
});

test("emoji and CJK survive default sanitization intact", () => {
  const value = "日本語 🎬 Test"; // "日本語 🎬 Test"
  assert.equal(sanitizeTokenValue(value), value);
});

test("length-capped truncation never splits a surrogate pair", () => {
  const emoji = "🎬";
  const longValue = emoji.repeat(100); // far past any reasonable segment cap
  const truncated = sanitizeSegment(longValue, { maxSegmentLength: 10 });
  assert.equal(truncated.length % 2, 0);
  for (let i = 0; i < truncated.length; i += 2) {
    assert.equal(truncated.charCodeAt(i), 0xd83c);
    assert.equal(truncated.charCodeAt(i + 1), 0xdfac);
  }
});

test("joinPath tolerates stray slashes on either side", () => {
  assert.equal(joinPath("/data/", "/Studio/Sub/"), "/data/Studio/Sub");
  assert.equal(joinPath("/data", "Studio"), "/data/Studio");
  assert.equal(joinPath("/data", ""), "/data");
});

test("joinPath matches a Windows-native root's own backslash separator, not just '/'", () => {
  assert.equal(
    joinPath("C:\\Media\\Library", "Studio/Sub"),
    "C:\\Media\\Library\\Studio\\Sub",
  );
  assert.equal(
    joinPath("C:\\Media\\Library\\", "Studio"),
    "C:\\Media\\Library\\Studio",
  );
  assert.equal(joinPath("C:\\Media\\Library", ""), "C:\\Media\\Library");
  assert.equal(
    joinPath("\\\\NAS\\Media\\", "Studio/Sub"),
    "\\\\NAS\\Media\\Studio\\Sub",
  );
});

test("renderPath falls back to a non-empty basename when every token renders blank", () => {
  const view = sceneView({
    studioNames: [],
    performerNames: [],
    tagNames: [],
    title: "",
    date: "",
  });
  const config = normalizeConfig({});
  const { folder, basenameNoExt } = renderPath(
    "{studio}",
    "{title}",
    view,
    config,
  );
  assert.equal(folder, "");
  assert.equal(basenameNoExt, "_");
});

test("findMissingRequiredData flags a pattern referencing studio hierarchy on a scene with no studio, but only ONCE", () => {
  const view = sceneView({ studioNames: [] });
  const missing = findMissingRequiredData(
    ["{studio_hierarchy}/{studio}/{title}"],
    view,
  );
  assert.equal(missing.length, 1);
  assert.equal(missing[0].token, "studio_hierarchy");
  assert.equal(missing[0].message, "scene has no studio assigned");
});

test("findMissingRequiredData dedupes by MESSAGE across different tokens, not just by the same token appearing twice", () => {
  const view = sceneView({ studioNames: [], date: null, performerNames: [] });
  const missing = findMissingRequiredData(
    ["{studio_root}/{studio} - {date} - {title} - {performers_not_in_title:3}"],
    view,
  );
  const messages = missing.map((m) => m.message);
  assert.deepEqual(messages, [
    "scene has no studio assigned",
    "scene has no date",
    "scene has no performers assigned",
  ]);
});

test("findMissingRequiredData does NOT flag {studio_hierarchy}/{studio} merely for lacking a parent network", () => {
  const view = sceneView({ studioNames: ["OnlyOne"] });
  const missing = findMissingRequiredData(
    ["{studio_hierarchy}/{studio}/{title}"],
    view,
  );
  assert.deepEqual(missing, []);
});

test("findMissingRequiredData ignores fields the pattern doesn't reference", () => {
  const view = sceneView({ studioNames: [] }); // no studio, but pattern below never mentions it
  const missing = findMissingRequiredData(["{tags}/{title}"], view);
  assert.deepEqual(missing, []);
});

test("findMissingRequiredData does not flag performers_not_in_title just because filtering happens to leave it empty", () => {
  // Every performer is named in the title -> filtered list is empty, but
  // there WERE performers, so this isn't "missing data"
  const view = sceneView({ title: "Amy Solo", performerNames: ["Amy"] });
  assert.deepEqual(
    findMissingRequiredData(["{performers_not_in_title}"], view),
    [],
  );
  // No performers at all IS missing data
  const noPerformers = sceneView({ performerNames: [] });
  const missing = findMissingRequiredData(
    ["{performers_not_in_title}"],
    noPerformers,
  );
  assert.deepEqual(
    missing.map((m) => m.token),
    ["performers_not_in_title"],
  );
});

test("{field?} suppresses the missing-data error for that occurrence only", () => {
  const view = sceneView({ studioNames: [] });
  assert.deepEqual(findMissingRequiredData(["{studio?}/{title}"], view), []);
  // A required (non-?) occurrence of the SAME token elsewhere still errors
  const missing = findMissingRequiredData(["{studio?}/{studio}/{title}"], view);
  assert.deepEqual(
    missing.map((m) => m.token),
    ["studio"],
  );
});

test("findMissingRequiredData flags a malformed (non-ISO) date only for the year/month/day tokens, not {date} itself", () => {
  const view = sceneView({ date: "circa 1998" });
  assert.deepEqual(findMissingRequiredData(["{date}"], view), []);
  const missing = findMissingRequiredData(["{date_year}"], view);
  assert.deepEqual(
    missing.map((m) => m.token),
    ["date_year"],
  );
});

test("<...> collapses as a whole (literal text included) when the optional token inside is empty, survives when it isn't", () => {
  const withData = render(
    "{studio}< - {performers_not_in_title?}>< - {title}>",
    sceneView(),
  );
  assert.equal(withData, "Leaf - Amy, Zed - My Title");
  const withoutData = render(
    "{studio}< - {performers_not_in_title?}>< - {title}>",
    sceneView({ performerNames: [] }),
  );
  assert.equal(withoutData, "Leaf - My Title");
});

test("<...> drops a leading segment when the token inside is empty", () => {
  const view = sceneView({ studioNames: [] });
  const result = render("<{studio?} - >{title}", view);
  assert.equal(result, "My Title");
});

test("<...> drops a trailing segment when the token inside is empty", () => {
  const view = sceneView({ studioNames: [] });
  const result = render("{title}< - {studio?}>", view);
  assert.equal(result, "My Title");
});

test("literal text OUTSIDE any <...> is never auto-collapsed, even if it looks separator-like", () => {
  const view = sceneView({ studioNames: [] });
  const result = render("pre-release {studio?}", view);
  // No brackets at all here: the literal "pre-release " stays exactly as
  // written regardless of what {studio?} does, and the empty token simply
  // contributes nothing — nothing "smart" happens without an explicit <...>.
  assert.equal(result, "pre-release ");
});

test("consecutive <...> segments collapse independently", () => {
  const view = sceneView({ studioNames: [], performerNames: [] });
  const result = render(
    "<{studio?} - ><{performers_not_in_title?} - >{title}",
    view,
  );
  assert.equal(result, "My Title");
});

test("a REQUIRED token inside <...> never triggers collapse", () => {
  // {title} is required (no "?"): the bracket has zero OPTIONAL tokens, so
  // it can never collapse regardless of {title}'s own value.
  const result = render("{studio}< - {title}>", sceneView());
  assert.equal(result, "Leaf - My Title");
});

test("an UNKNOWN token inside <...> counts as real content and never triggers collapse", () => {
  const result = renderTemplate("{studio}< - {bogus?}>", { studio: "Leaf" });
  assert.equal(result, "Leaf - {bogus?}");
});

test("an unmatched '<' (no closing '>') degrades to plain literal text, not an error", () => {
  const result = render("{studio} < unfinished", sceneView());
  assert.equal(result, "Leaf < unfinished");
});

test("a <...> bracket with no tokens at all (pure literal text) is always kept", () => {
  const result = render("{studio}<FIXED>", sceneView());
  assert.equal(result, "LeafFIXED");
});

test("<a|b|c> renders the first alternative that has content, skipping earlier collapsed ones", () => {
  const withCode = render(
    "<{code?}|{date?}|xxx>",
    sceneView({ code: "v1234", date: "2020-01-01" }),
  );
  assert.equal(withCode, "v1234");

  const withDateOnly = render(
    "<{code?}|{date?}|xxx>",
    sceneView({ code: "", date: "2020-01-01" }),
  );
  assert.equal(withDateOnly, "2020-01-01");

  const withNeither = render(
    "<{code?}|{date?}|xxx>",
    sceneView({ code: "", date: "" }),
  );
  assert.equal(withNeither, "xxx");
});

test("<a|b> collapses the whole group when every alternative is empty and there's no literal catch-all", () => {
  const result = render(
    "{title}< - {code?}| - {date?}>",
    sceneView({ code: "", date: "" }),
  );
  assert.equal(result, "My Title");
});

test("a plain-literal alternative always wins, even as the very first alternative", () => {
  const result = render("<xxx|{code?}>", sceneView({ code: "v1234" }));
  assert.equal(result, "xxx");
});

test("a required-token alternative always wins over later alternatives, same as any other non-collapsing one", () => {
  const result = render("<{title}|{code?}>", sceneView({ code: "v1234" }));
  assert.equal(result, "My Title");
});

test("each alternative can mix literal text with its token, e.g. its own separator, and that text travels with it only when chosen", () => {
  const withDate = render(
    "{title}< ({code?})| [{date?}]>",
    sceneView({ code: "", date: "2020-01-01" }),
  );
  assert.equal(withDate, "My Title [2020-01-01]");

  const withCode = render(
    "{title}< ({code?})| [{date?}]>",
    sceneView({ code: "v1234", date: "2020-01-01" }),
  );
  assert.equal(withCode, "My Title (v1234)");
});

test("a bracket with no '|' behaves exactly as a single-alternative chain", () => {
  const result = render(
    "{studio}< - {performers_not_in_title?}>",
    sceneView({ performerNames: [] }),
  );
  assert.equal(result, "Leaf");
});

test("{matched_performers}/{matched_tags} render only the ids a rule condition actually matched, not every performer/tag on the scene", () => {
  const view = sceneView({
    performerNames: ["Amy", "Zed"],
    performerIds: ["perf-amy", "perf-zed"],
    tagNames: ["Rock", "Pop"],
    tagIds: ["tag-rock", "tag-pop"],
  });
  const matchedIds = { performerIds: ["perf-zed"], tagIds: [] };
  assert.equal(render("{matched_performers}", view, null, matchedIds), "Zed");
  assert.equal(render("{matched_tags?}", view, null, matchedIds), "");
});

test("findMissingRequiredData flags {matched_performers}/{matched_tags} as missing when nothing matched (e.g. the default-pattern case)", () => {
  const view = sceneView();
  const missingNoIds = findMissingRequiredData(["{matched_performers}"], view);
  assert.deepEqual(
    missingNoIds.map((m) => m.token),
    ["matched_performers"],
  );

  const missingEmptyIds = findMissingRequiredData(["{matched_tags}"], view, {
    performerIds: [],
    tagIds: [],
  });
  assert.deepEqual(
    missingEmptyIds.map((m) => m.token),
    ["matched_tags"],
  );

  const notMissing = findMissingRequiredData(["{matched_performers}"], view, {
    performerIds: ["perf-zed"],
    tagIds: [],
  });
  assert.deepEqual(notMissing, []);
});

test("{stash_id} resolves to whichever of the scene's StashIDs matches the rule's configured stashBoxEndpoint, ignoring StashIDs from other sources", () => {
  const view = sceneView({
    stashIds: [
      { endpoint: "https://stashdb.org/graphql", stash_id: "aaa-111" },
      { endpoint: "https://theporndb.net/graphql", stash_id: "bbb-222" },
    ],
  });
  assert.equal(
    render("{stash_id}", view, null, {
      stashBoxEndpoint: "https://stashdb.org/graphql",
    }),
    "aaa-111",
  );
  assert.equal(
    render("{stash_id}", view, null, {
      stashBoxEndpoint: "https://theporndb.net/graphql",
    }),
    "bbb-222",
  );
});

test("{stash_id?} renders empty when no endpoint is configured, or when the scene has no StashID from the configured one", () => {
  const view = sceneView({
    stashIds: [
      { endpoint: "https://stashdb.org/graphql", stash_id: "aaa-111" },
    ],
  });
  assert.equal(render("{stash_id?}", view), "");
  assert.equal(
    render("{stash_id?}", view, null, {
      stashBoxEndpoint: "https://theporndb.net/graphql",
    }),
    "",
  );
});

test("findMissingRequiredData flags {stash_id} with a message that distinguishes 'no source configured' from 'scene has no ID from that source'", () => {
  const view = sceneView({
    stashIds: [
      { endpoint: "https://stashdb.org/graphql", stash_id: "aaa-111" },
    ],
  });

  const noEndpoint = findMissingRequiredData(["{stash_id}"], view);
  assert.equal(noEndpoint.length, 1);
  assert.equal(noEndpoint[0].token, "stash_id");
  assert.match(noEndpoint[0].message, /no stash-box source is configured/);

  const wrongEndpoint = findMissingRequiredData(["{stash_id}"], view, {
    stashBoxEndpoint: "https://theporndb.net/graphql",
  });
  assert.equal(wrongEndpoint.length, 1);
  assert.match(
    wrongEndpoint[0].message,
    /scene has no StashID from the configured stash-box source/,
  );

  const matching = findMissingRequiredData(["{stash_id}"], view, {
    stashBoxEndpoint: "https://stashdb.org/graphql",
  });
  assert.deepEqual(matching, []);
});

test("technical-detail tokens render from the scene view's precomputed primary-file fields", () => {
  const view = sceneView({
    resolution: "1080p",
    videoCodec: "h264",
    audioCodec: "aac",
    bitrateMbps: 8.4211,
    fps: 23.98,
    phash: "abc123def456",
    oshash: "112233445566",
    rating100: 85,
  });
  assert.equal(render("{resolution}", view), "1080p");
  assert.equal(render("{video_codec}", view), "h264");
  assert.equal(render("{audio_codec}", view), "aac");
  assert.equal(render("{bitrate}", view), "8.42Mbps");
  assert.equal(render("{fps}", view), "23.98fps");
  assert.equal(render("{phash}", view), "abc123def456");
  assert.equal(render("{oshash}", view), "112233445566");
  assert.equal(render("{rating}", view), "8.5");
});

test("{fps} drops a trailing .00 for a whole-number framerate", () => {
  const view = sceneView({ fps: 30 });
  assert.equal(render("{fps}", view), "30fps");
});

test("technical-detail tokens render empty (not an error at this level) when the scene view has no data for them", () => {
  const view = sceneView({
    resolution: null,
    videoCodec: null,
    audioCodec: null,
    bitrateMbps: null,
    fps: null,
    phash: null,
    oshash: null,
    rating100: null,
  });
  assert.equal(render("{resolution?}", view), "");
  assert.equal(render("{video_codec?}", view), "");
  assert.equal(render("{audio_codec?}", view), "");
  assert.equal(render("{bitrate?}", view), "");
  assert.equal(render("{fps?}", view), "");
  assert.equal(render("{phash?}", view), "");
  assert.equal(render("{oshash?}", view), "");
  assert.equal(render("{rating?}", view), "");
});

test("findMissingRequiredData flags every technical-detail token as missing (without '?') when the scene view has no data for it", () => {
  const view = sceneView({
    resolution: null,
    videoCodec: null,
    audioCodec: null,
    bitrateMbps: null,
    fps: null,
    phash: null,
    oshash: null,
    rating100: null,
  });
  const missing = findMissingRequiredData(
    [
      "{resolution}/{video_codec}/{audio_codec}/{bitrate}/{fps}/{phash}/{oshash}/{rating}",
    ],
    view,
  );
  assert.deepEqual(missing.map((m) => m.token).sort(), [
    "audio_codec",
    "bitrate",
    "fps",
    "oshash",
    "phash",
    "rating",
    "resolution",
    "video_codec",
  ]);
});
