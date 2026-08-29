import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTokens,
  renderTemplate,
  renderPath,
  sanitizeSegment,
  sanitizeTokenValue,
  normalizePathForCompare,
  joinBasename,
  folderPatternMode,
  filenamePatternMode,
  findUnknownTokens,
  findPatternProblems,
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

// pairs of [name, gender]; gender null means the performer has none set
function genderView(pairs, overrides) {
  return sceneView(
    Object.assign(
      {
        performerNames: pairs.map((p) => p[0]),
        performers: pairs.map((p) => ({
          id: "p-" + p[0],
          name: p[0],
          gender: p[1],
          favorite: false,
          rating100: null,
        })),
      },
      overrides,
    ),
  );
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
  assert.equal(
    render("{director}", sceneView({ director: "Kelly Loveless" })),
    "Kelly Loveless",
  );
  assert.equal(
    render("{photographer}", sceneView({ photographer: "Jo Photo" })),
    "Jo Photo",
  );
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

test("{director} and {photographer} are each reported missing on their own, independent of the other", () => {
  const view = sceneView({ director: "", photographer: "" });
  assert.equal(findMissingRequiredData(["{director}"], view).length > 0, true);
  assert.equal(
    findMissingRequiredData(["{photographer}"], view).length > 0,
    true,
  );
  assert.deepEqual(findMissingRequiredData(["{director?}"], view), []);
  assert.deepEqual(findMissingRequiredData(["{photographer?}"], view), []);
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

test("renderPath flags basenameHasContent false when every token is optional and none has data", () => {
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

test("findMissingRequiredData does not flag a gender filter that happens to match nobody", () => {
  const menOnly = genderView([["Marcus", "male"]]);
  assert.deepEqual(
    findMissingRequiredData(["{performers|gender=female}"], menOnly),
    [],
  );
  // No performers at all IS still missing data, reported the usual way
  const nobody = sceneView({ performerNames: [] });
  assert.deepEqual(
    findMissingRequiredData(["{performers|gender=female}"], nobody).map(
      (m) => m.token,
    ),
    ["performers"],
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

// "|" separates bracket alternatives AND a token's modifiers. Splitting a
// bracket naively tears "{performers|gender=female}" into two halves and
// renders garbage, so the split has to ignore pipes inside braces.
test("a '|' inside a token's modifiers does not start a new bracket alternative", () => {
  const view = sceneView({ performerNames: ["Amy", "Zed"] });
  // the modifier is a no-op here; what matters is that the brace stays intact
  assert.equal(
    render("<{performers|limit=9}|no performers>", view),
    "Amy, Zed",
  );
  assert.equal(
    render(
      "<{performers|limit=9?}|no performers>",
      sceneView({ performerNames: [] }),
    ),
    "no performers",
  );
});

test("the ? has to come last, and says so instead of being ignored", () => {
  const view = sceneView();
  // easy mistake when adding a modifier to a token that was already optional
  assert.equal(render("{performers?|limit=9}", view), "{performers?|limit=9}");
  assert.equal(render("{performers|limit=9?}", view), "Amy, Zed");
});

test("the documented <a|b|c> alternatives still split on their pipes", () => {
  // regression guard for the brace-aware split: these have no braces nested
  // around a pipe, so every one of them must behave exactly as before
  assert.equal(
    render("<{date?}|missing-date>", sceneView({ date: "" })),
    "missing-date",
  );
  assert.equal(
    render("<{date?}|missing-date>", sceneView({ date: "2024-03-05" })),
    "2024-03-05",
  );
});

// Locks in rendering for the patterns the README teaches, so the grammar
// refactor cannot quietly change what an existing user's pattern produces.
test("README example patterns render exactly as documented", () => {
  const view = sceneView({
    title: "My Title",
    code: "v1234",
    date: "2024-03-05",
    studioNames: ["OnlyFans"],
    performerNames: ["Ava Kensington", "Marcus Chen"],
    rating100: 85,
  });
  assert.equal(render("{studio_hierarchy}", view), "OnlyFans");
  assert.equal(
    render("{studio} - {date} - {title}", view),
    "OnlyFans - 2024-03-05 - My Title",
  );
  assert.equal(
    render("{studio}<, {date?}>< - {title?}>", view),
    "OnlyFans, 2024-03-05 - My Title",
  );
  assert.equal(
    render("<{code?}|{date?}|xxx> - {performers}", view),
    "v1234 - Ava Kensington, Marcus Chen",
  );
  assert.equal(
    render(
      "<{code?}|{date?}|xxx> - {performers}",
      Object.assign({}, view, { code: "" }),
    ),
    "2024-03-05 - Ava Kensington, Marcus Chen",
  );
  assert.equal(
    render(
      "<{code?}|{date?}|xxx> - {performers}",
      Object.assign({}, view, { code: "", date: "" }),
    ),
    "xxx - Ava Kensington, Marcus Chen",
  );
  assert.equal(
    render("{performers_not_in_title:2?}", view),
    "Ava Kensington, Marcus Chen",
  );
  assert.equal(render("< ({code?})| [{date?}]>", view), " (v1234)");
  assert.equal(
    render("< ({code?})| [{date?}]>", Object.assign({}, view, { code: "" })),
    " [2024-03-05]",
  );
});

// The scanner is looser than the grammar so malformed bodies can be reported.
// It must not start rendering them: "{studio bogus}" is not a studio token.
test("a token with a malformed body renders literally, like an unknown token", () => {
  const view = sceneView();
  assert.equal(render("{studio bogus}", view), "{studio bogus}");
  assert.equal(render("{performers:x}", view), "{performers:x}");
  assert.equal(render("{nonsense}", view), "{nonsense}");
});

test("|gender= keeps only performers of the named gender(s)", () => {
  const view = genderView([
    ["Ava", "female"],
    ["Marcus", "male"],
    ["Robin", "non_binary"],
    ["Unset", null],
  ]);
  assert.equal(render("{performers}", view), "Ava, Marcus, Robin, Unset");
  assert.equal(render("{performers|gender=female}", view), "Ava");
  assert.equal(render("{performers|gender=male}", view), "Marcus");
  assert.equal(
    render("{performers|gender=female,non_binary}", view),
    "Ava, Robin",
  );
  // a performer with no gender set is addressable, and is NOT swept up by
  // asking for a specific gender
  assert.equal(render("{performers|gender=unknown}", view), "Unset");
  assert.equal(
    render("{performers|gender=female}", view).includes("Unset"),
    false,
  );
});

test("|gender= accepts the longer spellings and ignores surrounding spaces", () => {
  const view = genderView([
    ["Tess", "trans_female"],
    ["Marcus", "male"],
  ]);
  assert.equal(render("{performers|gender=trans_female}", view), "Tess");
  assert.equal(render("{performers|gender=transgender_female}", view), "Tess");
  // the surviving performers keep their sort order; listing genders in a
  // different order does not reorder them
  assert.equal(
    render("{performers|gender=trans_female, male}", view),
    "Marcus, Tess",
  );
  assert.equal(
    render("{performers|gender=male,trans_female}", view),
    "Marcus, Tess",
  );
});

// pairs of [name, disambiguation]; "" means the performer has none
function disambiguationView(pairs, overrides) {
  return sceneView(
    Object.assign(
      {
        performerNames: pairs.map((p) => p[0]),
        performers: pairs.map((p, i) => ({
          id: "p" + i,
          name: p[0],
          disambiguation: p[1],
          favorite: false,
          rating100: null,
        })),
      },
      overrides,
    ),
  );
}

// The reason the modifier exists: Stash's uniqueness constraint is on the
// (name, disambiguation) pair, so these two really are different people and a
// folder pattern that renders them identically merges their files
test("|disambiguate keeps two performers who share a name apart", () => {
  const view = disambiguationView([
    ["Alex", "Blonde"],
    ["Alex", "Brunette"],
  ]);
  assert.equal(render("{performers}", view), "Alex, Alex");
  assert.equal(
    render("{performers|disambiguate}", view),
    "Alex (Blonde), Alex (Brunette)",
  );
  // one folder each, rather than one folder for both
  assert.equal(
    render("{performers|limit=1|disambiguate}", view),
    "Alex (Blonde)",
  );
});

test("|disambiguate leaves a performer without one exactly as they were", () => {
  const view = disambiguationView([
    ["Alex", "Blonde"],
    ["Marcus Chen", ""],
    ["Zed", undefined],
  ]);
  assert.equal(
    render("{performers|disambiguate}", view),
    "Alex (Blonde), Marcus Chen, Zed",
  );
});

test("|disambiguate sanitizes the disambiguation like any other path text", () => {
  const view = disambiguationView([["Alex", "II / the?sequel"]]);
  assert.equal(
    render("{performers|disambiguate}", view),
    "Alex (II the sequel)",
  );
});

test("|disambiguate composes with the other performer modifiers", () => {
  const view = sceneView({
    performerNames: ["Ava", "Marcus"],
    performers: [
      { id: "1", name: "Ava", disambiguation: "I", gender: "female" },
      { id: "2", name: "Marcus", disambiguation: "II", gender: "male" },
    ],
  });
  assert.equal(
    render("{performers|gender=female|disambiguate}", view),
    "Ava (I)",
  );
  // applied to the rendered name, so a later value modifier sees the suffix
  assert.equal(
    render("{performers|disambiguate|uppercase}", view),
    "AVA (I), MARCUS (II)",
  );
});

test("|disambiguate is refused on a token that has no performers", () => {
  const messageFor = (pattern) =>
    findPatternProblems(pattern)
      .map((p) => p.message)
      .join(" | ");
  assert.match(messageFor("{title|disambiguate}"), /only works on performer/);
  assert.match(messageFor("{tags|disambiguate}"), /only works on performer/);
  assert.match(messageFor("{performers|disambiguate=yes}"), /takes no value/);
  assert.deepEqual(
    findPatternProblems("{matched_performers|disambiguate}"),
    [],
  );
  assert.deepEqual(
    findPatternProblems("{performers_not_in_title|disambiguate}"),
    [],
  );
});

test("modifiers apply in the order they are written", () => {
  const view = genderView([
    ["Marcus", "male"],
    ["Zara", "female"],
  ]);
  assert.equal(render("{performers|limit=1}", view), "Marcus");
  assert.equal(render("{performers|gender=female|limit=1}", view), "Zara");
  assert.equal(render("{performers|limit=1|gender=female}", view), "");
  // :N alone still works and still means "cap the list"
  assert.equal(render("{performers:1}", view), "Marcus");
});

test("value modifiers rewrite the text of any token", () => {
  const view = sceneView({ title: "My Long Title" });
  assert.equal(render("{title|uppercase}", view), "MY LONG TITLE");
  assert.equal(render("{title|lowercase}", view), "my long title");
  assert.equal(render("{title|compact}", view), "MyLongTitle");
  assert.equal(render("{titlecheck}", view), "{titlecheck}");
  assert.equal(
    render("{title|lowercase|titlecase}", sceneView({ title: "THE BIG ONE" })),
    "The Big One",
  );
  assert.equal(render("{studio|uppercase}", view), "LEAF");
  assert.equal(render("{date|compact}", view), "2024-03-05");
});

test("value modifiers map over a list rather than hitting the joined string", () => {
  const view = sceneView({ performerNames: ["Amy Adams", "Zed Zane"] });
  assert.equal(render("{performers|compact}", view), "AmyAdams, ZedZane");
  assert.equal(render("{performers|uppercase}", view), "AMY ADAMS, ZED ZANE");
  // the delimiter survives even when it is made of letters
  assert.equal(
    render("{performers|uppercase}", view, {
      delimiters: { performers: " and " },
    }),
    "AMY ADAMS and ZED ZANE",
  );
});

test("a list filter still works after a value modifier has rewritten the names", () => {
  const view = genderView([
    ["Marcus", "male"],
    ["Zara", "female"],
  ]);
  assert.equal(render("{performers|uppercase|gender=female}", view), "ZARA");
  assert.equal(render("{performers|gender=female|uppercase}", view), "ZARA");
});

test("titlecase runs before compact, if that is the order written", () => {
  const view = sceneView({ title: "ava kensington" });
  assert.equal(render("{title|titlecase|compact}", view), "AvaKensington");
  // and the other way round it cannot see the word boundary any more
  assert.equal(render("{title|compact|titlecase}", view), "Avakensington");
});

test("a gender filter applies per token, so the same list can be filtered in one place and not another", () => {
  const view = genderView([
    ["Ava", "female"],
    ["Marcus", "male"],
  ]);
  assert.equal(
    render("{performers|gender=female}/{performers}", view),
    "Ava/Ava, Marcus",
  );
  const matchedIds = { performerIds: ["p-Ava", "p-Marcus"], tagIds: [] };
  assert.equal(
    render("{matched_performers|gender=female}", view, null, matchedIds),
    "Ava",
  );
  assert.equal(
    render("{matched_performers}", view, null, matchedIds),
    "Ava, Marcus",
  );
});

test("a gender filter matching nobody renders empty rather than erroring", () => {
  const menOnly = genderView([["Marcus", "male"]]);
  assert.equal(render("{performers|gender=female}", menOnly), "");
  // and an empty segment is dropped rather than leaving a "//" in the path
  const rendered = renderPath(
    "{studio}/{performers|gender=female}",
    "{title}",
    menOnly,
    normalizeConfig({}),
    null,
  );
  assert.equal(rendered.folder, "Leaf");
});

// <...> normally only collapses around {token?}, on the premise that a required
// token always has data (it errors as missing data otherwise). A filter breaks
// that premise: the token IS required, the scene DOES have performers, and it
// still renders empty. Without this the bracket renders a bare "[]".
test("<...> collapses around a required list token that a filter emptied", () => {
  const menOnly = genderView([["Marcus", "male"]]);
  assert.equal(
    render("{title}< [{performers|gender=female}]>", menOnly),
    "My Title",
  );
  // still renders normally when the filter does match somebody
  const mixed = genderView([
    ["Ava", "female"],
    ["Marcus", "male"],
  ]);
  assert.equal(
    render("{title}< [{performers|gender=female}]>", mixed),
    "My Title [Ava]",
  );
  // and a filtered-empty alternative now falls through to the next one
  assert.equal(
    render("{title}< [{performers|gender=female}]|-nobody>", menOnly),
    "My Title-nobody",
  );
});

test("the same collapse applies to performers_not_in_title, which filters too", () => {
  const allInTitle = sceneView({
    title: "Amy Solo",
    performerNames: ["Amy"],
  });
  assert.equal(
    render("{title}< [{performers_not_in_title}]>", allInTitle),
    "Amy Solo",
  );
});

// The distinction that keeps {token?} meaningful: "filtered to nothing" is not
// the same as "no data at all", and only the former collapses silently.
test("an empty base list is still missing data rather than a silent collapse", () => {
  const nobody = sceneView({ performerNames: [] });
  assert.deepEqual(
    findMissingRequiredData(
      ["{title}< [{performers|gender=female}]>"],
      nobody,
    ).map((m) => m.token),
    ["performers"],
  );
  // adding ? opts out of that error, as it always has
  assert.deepEqual(
    findMissingRequiredData(
      ["{title}< [{performers|gender=female?}]>"],
      nobody,
    ),
    [],
  );
});

test("a required non-list token that is merely empty still does not collapse a bracket", () => {
  // guards against widening the collapse rule beyond filtered lists: an empty
  // {studio} is missing data, reported as such, not quietly dropped
  assert.equal(
    renderTemplate("{title}< [{studio}]>", { title: "T", studio: "" }),
    "T []",
  );
});

test("findPatternProblems explains every way a modifier can be wrong", () => {
  const messageFor = (pattern) =>
    findPatternProblems(pattern)
      .map((p) => p.message)
      .join(" | ");

  const badValue = messageFor("{performers|gender=femal}");
  assert.match(badValue, /no gender "femal"/);
  assert.match(badValue, /female/);
  assert.match(badValue, /trans_female/);
  assert.match(badValue, /unknown/);

  assert.match(messageFor("{performers|bogus=1}"), /no "bogus" modifier/);
  assert.match(messageFor("{performers|bogus=1}"), /gender/);
  assert.match(messageFor("{title|gender=female}"), /only works on performer/);
  assert.match(messageFor("{tags|gender=female}"), /only works on performer/);
  assert.match(messageFor("{performers|gender}"), /needs a value/);
  assert.match(
    messageFor("{performers|gender=female|gender=male}"),
    /more than once/,
  );
  assert.match(messageFor("{title:2}"), /only means something on a list token/);
  assert.match(messageFor("{nonsense}"), /no \{nonsense\} token/);
  assert.match(messageFor("{title|uppercase=yes}"), /uppercase takes no value/);
  assert.match(
    messageFor("{title|uppercase|lowercase}"),
    /only set its capitalisation once/,
  );
  assert.deepEqual(
    findPatternProblems("{performers|limit=1|gender=female?}"),
    [],
  );
  assert.deepEqual(findPatternProblems("{title|compact|uppercase}"), []);
});

test("only modifier mistakes block a rename; unknown tokens stay lenient", () => {
  const blocking = (pattern) =>
    findPatternProblems(pattern)
      .filter((p) => p.blocking)
      .map((p) => p.message);
  assert.equal(blocking("{performers|gender=femal}").length, 1);
  assert.equal(blocking("{performers|bogus=1}").length, 1);
  // these have always rendered literally, and must keep doing so
  assert.deepEqual(blocking("{nonsense}"), []);
  assert.deepEqual(blocking("{studio bogus}"), []);
  assert.deepEqual(blocking("{title:2}"), []);
  // :N still renames, it just says what to write instead
  assert.deepEqual(blocking("{performers:2}"), []);
});

// :N is kept for the one spelling where its fixed position cannot mislead:
// on its own there is no other modifier for it to be ordered against
test(":N is accepted alone and refused beside any modifier", () => {
  assert.deepEqual(findPatternProblems("{performers:2}"), []);
  assert.deepEqual(findPatternProblems("{performers:2?}"), []);
  assert.deepEqual(findPatternProblems("{performers|limit=2}"), []);

  const problems = findPatternProblems("{performers:1|gender=female}");
  assert.equal(problems.length, 1);
  // blocking: renaming on a pattern that reads backwards is the thing to avoid
  assert.equal(problems[0].blocking, true);
  assert.match(problems[0].message, /only works on its own/);
  assert.match(problems[0].message, /\{performers\|limit=1\|gender=female\}/);

  // the rewrite it suggests has to be accepted, or the advice is a dead end
  assert.deepEqual(
    findPatternProblems("{performers|limit=1|gender=female}"),
    [],
  );
});

test("patternUsesAnyToken and hasUnsafeOptionalOnlyBasename see through modifiers", () => {
  assert.equal(
    patternUsesAnyToken("{performers|gender=female}", PERFORMER_SORT_TOKENS),
    true,
  );
  assert.equal(
    patternUsesAnyToken("{performers:1|gender=female?}", PERFORMER_SORT_TOKENS),
    true,
  );
  assert.equal(patternUsesAnyToken("{title}", PERFORMER_SORT_TOKENS), false);
  assert.equal(
    hasUnsafeOptionalOnlyBasename("{performers|gender=female?}"),
    true,
  );
  assert.equal(
    hasUnsafeOptionalOnlyBasename("{performers|gender=female}"),
    false,
  );
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
    /scene has no StashID from https:\/\/theporndb\.net\/graphql/,
  );
  // and carried structurally so the UI can swap in its configured display name
  assert.equal(wrongEndpoint[0].endpoint, "https://theporndb.net/graphql");

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

test("normalizePathForCompare treats backslash and forward-slash paths as the same folder", () => {
  // Stash reports native paths, so a Windows library and a pattern-built path
  // can disagree on separators while naming the same folder
  assert.equal(
    normalizePathForCompare("C:\\Stash\\Library\\Acme"),
    normalizePathForCompare("C:/Stash/Library/Acme"),
  );
  assert.equal(
    normalizePathForCompare("C:\\Stash\\Library\\"),
    normalizePathForCompare("C:\\Stash\\Library"),
  );
  assert.equal(normalizePathForCompare("/data/Acme/"), "/data/Acme");
});

test("joinBasename uses the separator the folder already uses", () => {
  assert.equal(
    joinBasename("C:\\Stash\\Library\\Acme", "f.mp4"),
    "C:\\Stash\\Library\\Acme\\f.mp4",
  );
  assert.equal(joinBasename("/data/Acme", "f.mp4"), "/data/Acme/f.mp4");
  assert.equal(joinBasename("C:\\Stash\\", "f.mp4"), "C:\\Stash\\f.mp4");
  assert.equal(joinBasename("", "f.mp4"), "f.mp4");
});

test("a folder pattern may use backslashes to nest, as Windows users write them", () => {
  const view = {
    title: "T",
    date: "2024-01-05",
    studioNames: ["Acme"],
    performers: [],
    tags: [],
    stashIds: [],
  };
  const cfg = { delimiters: {}, sanitize: {} };
  const ids = { performerIds: [], tagIds: [], stashBoxEndpoint: "" };

  const back = renderPath("{studio}\\{date_year}", "{title}", view, cfg, ids);
  const fwd = renderPath("{studio}/{date_year}", "{title}", view, cfg, ids);
  assert.equal(back.folder, "Acme/2024");
  assert.equal(back.folder, fwd.folder);

  // mixed separators in one pattern still nest one level per separator
  assert.equal(
    renderPath("Photos\\{studio}/{date_year}", "{title}", view, cfg, ids)
      .folder,
    "Photos/Acme/2024",
  );
});

test("a separator inside a token's value never nests, only the pattern's own separators do", () => {
  const view = {
    title: "A/B",
    studioNames: ["Rock\\Pop"],
    performers: [],
    tags: [{ id: "t1", name: "Rock/Pop" }],
    tagNames: ["Rock/Pop"],
    tagIds: ["t1"],
    stashIds: [],
  };
  const cfg = { delimiters: {}, sanitize: {} };
  const ids = { performerIds: [], tagIds: [], stashBoxEndpoint: "" };

  assert.equal(
    renderPath("{tags}", "{title}", view, cfg, ids).folder,
    "Rock Pop",
  );
  assert.equal(
    renderPath("{studio}", "{title}", view, cfg, ids).folder,
    "Rock Pop",
  );
  // the filename never splits into subfolders either
  assert.equal(
    renderPath("{tags}", "{title}", view, cfg, ids).basenameNoExt,
    "A B",
  );
});

test("{studio_hierarchy} still expands to one folder per studio", () => {
  const view = {
    title: "T",
    studioNames: ["Parent", "Acme"],
    performers: [],
    tags: [],
    stashIds: [],
  };
  const cfg = { delimiters: {}, sanitize: {} };
  const ids = { performerIds: [], tagIds: [], stashBoxEndpoint: "" };
  assert.equal(
    renderPath("{studio_hierarchy}", "{title}", view, cfg, ids).folder,
    "Parent/Acme",
  );
});

test("the {stash_id} entry carries no endpoint when no source is configured, since there is none to name", () => {
  const view = sceneView({ stashIds: [] });
  const missing = findMissingRequiredData(["{stash_id}"], view);
  assert.equal(missing[0].endpoint, undefined);
});

test("folderPatternMode reads intent off the raw pattern, which renderPath would otherwise erase", () => {
  // keep-in-place is spelled {current} now; a literal blank means nothing and
  // is reported rather than guessed at
  assert.equal(folderPatternMode("{current}"), "keep");
  assert.equal(folderPatternMode(" {current} "), "keep");
  assert.equal(folderPatternMode(""), "blank");
  assert.equal(folderPatternMode("   "), "blank");
  assert.equal(folderPatternMode(undefined), "blank");
  assert.equal(folderPatternMode(null), "blank");
  // composed or modified, it is an ordinary rendered pattern (and refused by
  // findPatternProblems, which is where the reason is explained)
  assert.equal(folderPatternMode("{current}/{studio}"), "render");
  assert.equal(folderPatternMode("{current|uppercase}"), "render");
  assert.equal(folderPatternMode("/"), "root");
  assert.equal(folderPatternMode("//"), "root");
  assert.equal(folderPatternMode("\\"), "root");
  assert.equal(folderPatternMode("{studio}"), "render");
  assert.equal(folderPatternMode("{studio?}"), "render");
  assert.equal(folderPatternMode("literal"), "render");
});

test("filenamePatternMode reads the same intent, but has no root case: a filename never splits into folders", () => {
  assert.equal(filenamePatternMode("{current}"), "keep");
  assert.equal(filenamePatternMode(" {current} "), "keep");
  assert.equal(filenamePatternMode(""), "blank");
  assert.equal(filenamePatternMode("   "), "blank");
  assert.equal(filenamePatternMode(undefined), "blank");
  assert.equal(filenamePatternMode(null), "blank");
  // a modifier makes it a rename like any other, so it is sanitised as one
  assert.equal(filenamePatternMode("{current|uppercase}"), "render");
  assert.equal(filenamePatternMode("{current} - {date}"), "render");
  assert.equal(filenamePatternMode("/"), "render");
  assert.equal(filenamePatternMode("{title}"), "render");
  assert.equal(filenamePatternMode("{title?}"), "render");
  assert.equal(filenamePatternMode("literal"), "render");
});

const BOXES = [
  { name: "StashDB", endpoint: "https://stashdb.org/graphql" },
  { name: "ThePornDB", endpoint: "https://theporndb.net/graphql" },
  { name: "FansDB", endpoint: "https://fansdb.cc/graphql" },
];

function twoSourceView() {
  return sceneView({
    stashIds: [
      { endpoint: "https://stashdb.org/graphql", stash_id: "aaa-111" },
      { endpoint: "https://theporndb.net/graphql", stash_id: "bbb-222" },
    ],
  });
}

test("|from= picks a stash-box by name, case-insensitively", () => {
  const view = twoSourceView();
  const ids = { stashBoxes: BOXES };
  assert.equal(render("{stash_id|from=StashDB}", view, null, ids), "aaa-111");
  assert.equal(render("{stash_id|from=stashdb}", view, null, ids), "aaa-111");
  assert.equal(render("{stash_id|from=STASHDB}", view, null, ids), "aaa-111");
  assert.equal(render("{stash_id|from=ThePornDB}", view, null, ids), "bbb-222");
});

// the whole point of the feature: one pattern, several sources
test("several {stash_id} tokens with different sources all render in one pattern", () => {
  assert.equal(
    render(
      "{stash_id|from=StashDB}-{stash_id|from=ThePornDB}",
      twoSourceView(),
      null,
      {
        stashBoxes: BOXES,
      },
    ),
    "aaa-111-bbb-222",
  );
});

test("|from= wins over the pattern's stored stashBoxEndpoint", () => {
  assert.equal(
    render("{stash_id|from=StashDB}", twoSourceView(), null, {
      stashBoxEndpoint: "https://theporndb.net/graphql",
      stashBoxes: BOXES,
    }),
    "aaa-111",
  );
});

// a user can delete a stash-box from Stash while their scenes keep its ids
test("a from= value that is a URL resolves even when no configured box uses it", () => {
  const view = sceneView({
    stashIds: [
      { endpoint: "https://gone.example/graphql", stash_id: "ghost-1" },
    ],
  });
  assert.equal(
    render("{stash_id|from=https://gone.example/graphql}", view, null, {
      stashBoxes: BOXES,
    }),
    "ghost-1",
  );
});

test("with exactly one configured stash-box, {stash_id} needs no source at all", () => {
  const view = sceneView({
    stashIds: [
      { endpoint: "https://stashdb.org/graphql", stash_id: "aaa-111" },
    ],
  });
  const only = [BOXES[0]];
  assert.equal(
    render("{stash_id}", view, null, { stashBoxes: only }),
    "aaa-111",
  );
  // two boxes is ambiguous, so it stays unresolved
  assert.equal(render("{stash_id?}", view, null, { stashBoxes: BOXES }), "");
});

// null means "we could not find out", which must never be treated as knowledge
test("an unknown stash-box list never triggers the single-box default", () => {
  const view = sceneView({
    stashIds: [
      { endpoint: "https://stashdb.org/graphql", stash_id: "aaa-111" },
    ],
  });
  assert.equal(render("{stash_id?}", view, null, { stashBoxes: null }), "");
  assert.equal(render("{stash_id?}", view, null, {}), "");
});

test("two unresolved sources are reported separately, each naming its own", () => {
  const view = sceneView({ stashIds: [] });
  const missing = findMissingRequiredData(
    ["{stash_id|from=StashDB}-{stash_id|from=ThePornDB}"],
    view,
    { stashBoxes: BOXES },
  );
  assert.equal(missing.length, 2);
  assert.deepEqual(
    missing.map((m) => m.endpoint),
    ["https://stashdb.org/graphql", "https://theporndb.net/graphql"],
  );
});

test("two spellings of the SAME source collapse to one report", () => {
  const view = sceneView({ stashIds: [] });
  const missing = findMissingRequiredData(
    ["{stash_id|from=StashDB}-{stash_id|from=https://stashdb.org/graphql}"],
    view,
    { stashBoxes: BOXES },
  );
  assert.equal(missing.length, 1);
});

test("an unresolvable source name is reported the way the user typed it, with no endpoint to name", () => {
  const view = sceneView({ stashIds: [] });
  const missing = findMissingRequiredData(["{stash_id|from=Nope}"], view, {
    stashBoxes: BOXES,
  });
  assert.equal(missing.length, 1);
  assert.match(missing[0].message, /no stash-box source named "Nope"/);
  assert.equal(missing[0].endpoint, undefined);
});

test("findPatternProblems checks from= against the configured stash-boxes", () => {
  const problems = (pattern, stashBoxes) =>
    findPatternProblems(pattern, null, { stashBoxes });

  const bogus = problems("{stash_id|from=Bogus}", BOXES);
  assert.equal(bogus.length, 1);
  assert.equal(bogus[0].blocking, true);
  assert.match(bogus[0].message, /no stash-box source named "Bogus"/);
  // the message is the only place the valid names appear
  assert.match(bogus[0].message, /StashDB, ThePornDB, FansDB/);

  assert.deepEqual(problems("{stash_id|from=stashdb}", BOXES), []);

  const none = problems("{stash_id|from=StashDB}", []);
  assert.equal(none.length, 1);
  assert.equal(none[0].blocking, true);
  assert.match(none[0].message, /no stash-box sources configured/);

  // an unrecognised URL is a hint, not a refusal: the scene may still carry ids
  const urlHint = problems(
    "{stash_id|from=https://gone.example/graphql}",
    BOXES,
  );
  assert.equal(urlHint.length, 1);
  assert.equal(urlHint[0].blocking, false);
});

// a blocking problem refuses the rename, so guessing while the list is merely
// unavailable would turn a transient gap into "nothing renames at all"
test("an unknown stash-box list produces no from= problems whatsoever", () => {
  assert.deepEqual(findPatternProblems("{stash_id|from=Bogus}"), []);
  assert.deepEqual(
    findPatternProblems("{stash_id|from=Bogus}", null, { stashBoxes: null }),
    [],
  );
});

test("from= is rejected on tokens that have no stash-box source", () => {
  const messages = (p) =>
    findPatternProblems(p)
      .map((x) => x.message)
      .join(" | ");
  assert.match(messages("{title|from=StashDB}"), /only works on stash_id/);
  assert.match(messages("{performers|from=StashDB}"), /only works on stash_id/);
  assert.match(
    messages("{stash_id|from=A|from=B}"),
    /sets from more than once/,
  );
  assert.match(messages("{stash_id|from=}"), /from= needs a stash-box name/);
});

// TOKEN_ENTITY_KINDS doubles as the list-token enumeration in this message, so
// registering stash_id for modifier targeting must not leak into it
test("the limit message still names exactly the list tokens, never stash_id", () => {
  const message = findPatternProblems("{title:2}")[0].message;
  assert.match(message, /performers, performers_not_in_title/);
  assert.equal(message.includes("stash_id"), false);
  // and a limit on stash_id is still reported as meaningless
  assert.match(findPatternProblems("{stash_id:2}")[0].message, /list token/);
});

test("regex= rewrites a token with a find/replace pair", () => {
  const view = sceneView({ title: "Happy 420 day" });
  assert.equal(
    render("{title|regex=/(?:\\D*(\\d+).*)/Time for $1/}", view),
    "Time for 420",
  );
  // braces of a quantifier are inside the value, not the end of the token
  assert.equal(render("{date|regex=/(\\d{4}).*/$1/}", view), "2024");
  assert.equal(render("{title|regex=/ - Trailer//}", view), "Happy 420 day");
  assert.equal(render("{title|regex=/Happy/Sad/}", view), "Sad 420 day");
  assert.equal(render("{title|regex=/nomatch/x/}", view), "Happy 420 day");
  // an alternation inside the value is not a new bracket alternative
  assert.equal(
    render("{title|regex=/(Happy|Sad)/Glad/}", view),
    "Glad 420 day",
  );
});

test("regex= maps over a list and composes left to right", () => {
  const view = sceneView({ performerNames: ["Amy Adams", "Zed Zane"] });
  assert.equal(render("{performers|regex=/ /_/}", view), "Amy_Adams, Zed_Zane");
  assert.equal(render("{performers|regex=/ /_/|limit=1}", view), "Amy_Adams");
  const titled = sceneView({ title: "Happy 420 day" });
  assert.equal(
    render("{title|regex=/(?:\\D*(\\d+).*)/Ep $1/|uppercase}", titled),
    "EP 420",
  );
  assert.equal(
    render("{title|uppercase|regex=/HAPPY/Sad/}", titled),
    "Sad 420 DAY",
  );
});

test("regex= cannot smuggle a path separator into a value", () => {
  const view = sceneView({ title: "Happy 420 day" });
  assert.equal(render("{title|regex=/ /\\//}", view), "Happy 420 day");
  const cfg = normalizeConfig({});
  const result = renderPath(
    "{title|regex=/ /\\//}",
    "{title}",
    view,
    cfg,
    null,
  );
  assert.equal(result.folder, "Happy 420 day");
});

test("a regex that empties a value collapses a bracket group", () => {
  const view = sceneView({ title: "Happy 420 day" });
  assert.equal(render("{studio}< [{title|regex=/^.+$//}]>", view), "Leaf");
  assert.equal(
    render("{studio}< [{title|regex=/(\\d+)/$1/}]>", view),
    "Leaf [Happy 420 day]",
  );
  assert.equal(render("<{title|regex=/^.+$//}|Unsorted>", view), "Unsorted");
});

// These were all tested in Goja and found to be quite different
// than how the JavaScript regexes in my browser work
test("regex= refuses constructs that differ between preview and rename", () => {
  const messageFor = (pattern) =>
    findPatternProblems(pattern)
      .map((p) => p.message)
      .join(" | ");
  assert.match(messageFor("{title|regex=/(\\d)/$<n>/}"), /\$<name>/);
  assert.match(messageFor("{title|regex=/\\p{Lu}/x/}"), /\\p\{\.\.\.\}/);
  assert.match(messageFor("{title|regex=/[[:digit:]]/x/}"), /POSIX/);
  assert.match(
    messageFor("{title|regex=/(\\d)/\\1/}"),
    /write \$1 rather than/,
  );
  assert.match(messageFor("{title|regex=/(oops/x/}"), /not a valid regular/);
  assert.match(messageFor("{title|regex=/nope}"), /find\/replace/);
  assert.match(messageFor("{title|regex}"), /needs a value/);
  assert.match(messageFor("{title|regex=//x/}"), /nothing to search for/);
  assert.deepEqual(findPatternProblems("{title|regex=/(\\d+)/[$1]/}"), []);
});

test("regex= refuses a pattern that can match nothing", () => {
  const messageFor = (pattern) =>
    findPatternProblems(pattern)
      .map((p) => p.message)
      .join(" | ");
  assert.match(messageFor("{title|regex=/a?/X/}"), /can match nothing at all/);
  assert.match(messageFor("{title|regex=/ */_/}"), /can match nothing at all/);
  assert.match(messageFor("{title|regex=/\\d*/X/}"), /can match nothing/);
  // the + spellings of the same intent are fine
  assert.deepEqual(findPatternProblems("{title|regex=/a+/X/}"), []);
  assert.deepEqual(findPatternProblems("{title|regex=/ +/_/}"), []);
  assert.deepEqual(findPatternProblems("{title|regex=/^.+$//}"), []);
  // and so is the target case, whose \D* is guarded by a required \d+
  assert.deepEqual(
    findPatternProblems("{title|regex=/(?:\\D*(\\d+).*)/Time for $1/}"),
    [],
  );
});
