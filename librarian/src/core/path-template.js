import { sortEntities } from "./entity-sort.js";
import { customFieldText } from "./custom-fields.js";
import {
  scanPattern,
  splitTopLevel,
  applyListModifiers,
  applyValueModifiers,
  modifierValue,
  hasModifier,
  CUSTOM_FIELD_TOKEN,
  MODIFIERS,
  MODIFIER_GROUPS,
  knownModifierNames,
} from "./token-grammar.js";

export const KNOWN_TOKENS = [
  "studio",
  "studio_root",
  "studio_hierarchy",
  "performers",
  "performers_not_in_title",
  "matched_performers",
  "tags",
  "matched_tags",
  "title",
  "code",
  "director",
  "date",
  "date_year",
  "date_month",
  "date_day",
  "rating",
  "stash_id",
  // scenes only: galleries and images have no groups
  "group",
  "group_idx",
  // The path the file already has. Unlike every other token this one reads what
  // the pattern writes, so it is the only token that can fail to settle: see
  // currentUsage and the fixed-point check in plan-scene
  "current",
  CUSTOM_FIELD_TOKEN,
  // Optional file metadata
  "phash",
  // Core file metadata, should always be available
  "resolution",
  "video_codec",
  "audio_codec",
  "bitrate",
  "fps",
  "oshash",
];

const EMPTY_MATCHED_IDS = {
  performerIds: [],
  tagIds: [],
  stashBoxEndpoint: "",
  stashBoxes: null,
};

export const PERFORMER_SORT_TOKENS = [
  "performers",
  "performers_not_in_title",
  "matched_performers",
];

export const FILE_TECH_TOKENS = [
  "resolution",
  "video_codec",
  "audio_codec",
  "bitrate",
  "fps",
  "oshash",
];

// the control characters are the point: a filename must not contain them
// eslint-disable-next-line no-control-regex
const ILLEGAL_CHARS_REGEX = /[<>:"/\\|?*\x00-\x1F]/g;

// Let's be careful with the Windows thing
const RESERVED_NAMES = {};
["CON", "PRN", "AUX", "NUL"].forEach((name) => {
  RESERVED_NAMES[name] = true;
});
for (let i = 0; i <= 9; i++) {
  RESERVED_NAMES["COM" + i] = true;
  RESERVED_NAMES["LPT" + i] = true;
}

function stripIllegalChars(str) {
  return str.replace(ILLEGAL_CHARS_REGEX, " ").replace(/\s+/g, " ").trim();
}

export function sanitizeTokenValue(value) {
  let result = String(value == null ? "" : value).normalize("NFC");
  result = stripIllegalChars(result);
  return result;
}

function disarmReservedName(segment) {
  const dotIndex = segment.indexOf(".");
  const namePart = dotIndex === -1 ? segment : segment.slice(0, dotIndex);
  const rest = dotIndex === -1 ? "" : segment.slice(dotIndex);
  if (RESERVED_NAMES[namePart.toUpperCase()]) {
    return namePart + "_" + rest;
  }
  return segment;
}

function utf8ByteLength(str) {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4; // astral codepoint (surrogate pair) -> 4 UTF-8 bytes
        i++;
        continue;
      }
    }
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else bytes += 3;
  }
  return bytes;
}

function truncateToLimits(str, maxBytes, maxUtf16Units) {
  if (utf8ByteLength(str) <= maxBytes && str.length <= maxUtf16Units) {
    return str;
  }
  const codePoints = Array.from(str);
  while (codePoints.length > 0) {
    const candidate = codePoints.join("");
    if (
      utf8ByteLength(candidate) <= maxBytes &&
      candidate.length <= maxUtf16Units
    ) {
      return candidate;
    }
    codePoints.pop();
  }
  return "";
}

function sanitizeSegmentRaw(segment, sanitizeOptions) {
  const options = sanitizeOptions || {};
  let result = String(segment == null ? "" : segment).normalize("NFC");
  result = stripIllegalChars(result);
  result = result.replace(/^[.\s]+|[.\s]+$/g, "");
  if (options.spaceReplacement) {
    result = result.split(" ").join(options.spaceReplacement);
  }
  result = disarmReservedName(result);
  const maxLength = options.maxSegmentLength || 255;
  result = truncateToLimits(result, maxLength, maxLength);
  return result;
}

export function sanitizeSegment(segment, sanitizeOptions) {
  const result = sanitizeSegmentRaw(segment, sanitizeOptions);
  return result === "" ? "_" : result;
}

function entitiesForIds(entities, idsToKeep) {
  const keep = idsToKeep || [];
  return entities.filter((e) => {
    return keep.indexOf(e.id) !== -1;
  });
}

function listValue(entities, delimiter, sourceCount) {
  return {
    __list: true,
    entities: entities,
    delimiter: delimiter,
    sourceCount: sourceCount === undefined ? entities.length : sourceCount,
  };
}

// {studio_hierarchy} is the one token whose value is allowed to carry "/", so
// it is also the one token that must not be re-sanitized afterwards
const SLASH_EXEMPT_TOKENS = { studio_hierarchy: true, current: true };

// We can't allow a regex to insert a slash to create a new folder hierarchy
// because it breaks a lot of other assumptions we've made
function resanitize(text, parsed) {
  return SLASH_EXEMPT_TOKENS[parsed.name] ? text : sanitizeTokenValue(text);
}

function renderTokenValue(value, parsed) {
  if (value && value.__list) {
    const pairs = value.entities.map((e) => {
      return { entity: e, name: sanitizeTokenValue(e.name) };
    });
    const text = applyListModifiers(pairs, parsed)
      .map((pair) => {
        return resanitize(pair.name, parsed);
      })
      .join(value.delimiter);
    return { text: text, filteredEmpty: text === "" && value.sourceCount > 0 };
  }
  if (value && value.__stashId) {
    const source = resolveStashIdSource(parsed, value.matchedIds);
    const hit = source.endpoint
      ? value.stashIds.filter((s) => {
          return s.endpoint === source.endpoint;
        })
      : [];
    const id = hit.length > 0 ? hit[0].stash_id : "";
    return {
      text: resanitize(
        applyValueModifiers(sanitizeTokenValue(id), parsed),
        parsed,
      ),
      filteredEmpty: false,
    };
  }
  const source =
    value && value.__customField
      ? sanitizeTokenValue(customFieldText(value.fields[parsed.arg]))
      : String(value);
  const text = resanitize(applyValueModifiers(source, parsed), parsed);
  return {
    // a regex that matches everything empties a token that did have data, which
    // collapses a <...> group exactly like an emptied list does
    text: text,
    filteredEmpty: text === "" && source !== "",
  };
}

function looksLikeEndpoint(value) {
  return value.indexOf("://") !== -1;
}

// The only place we resolve stash-boxes
// shared by the Goja backend so it must stay compatible
export function resolveStashIdSource(parsed, matchedIds) {
  const matched = matchedIds || EMPTY_MATCHED_IDS;
  const boxes = matched.stashBoxes;
  const listKnown = !!boxes;
  const requested = (modifierValue(parsed, "from") || "").trim();

  if (requested) {
    if (looksLikeEndpoint(requested)) {
      return {
        endpoint: requested,
        requested: requested,
        listKnown: listKnown,
      };
    }
    const wanted = requested.toLowerCase();
    const hit = (boxes || []).filter((b) => {
      return (
        b &&
        String(b.name || "")
          .trim()
          .toLowerCase() === wanted
      );
    });
    return {
      // first match wins; duplicate names are the user's problem
      endpoint: hit.length > 0 ? hit[0].endpoint || "" : "",
      requested: requested,
      listKnown: listKnown,
    };
  }

  const stored = matched.stashBoxEndpoint || "";
  if (stored) {
    return { endpoint: stored, requested: "", listKnown: listKnown };
  }

  if (listKnown && boxes.length === 1) {
    return {
      endpoint: boxes[0].endpoint || "",
      requested: "",
      listKnown: listKnown,
    };
  }

  return { endpoint: "", requested: "", listKnown: listKnown };
}

// The group both group tokens speak for. A scene can be in several, and Stash
// returns them unordered, so normalizeScene sorts by id and this takes the
// first: the earliest-created group, which is stable across runs and unaffected
// by renaming. `ambiguous` is what the planner warns on.
//
// Resolving in one place is the point. Choosing per token would let {group} say
// "Teen Dreams" while {group_idx} answered for a different movie, which reads
// as a perfectly plausible filename and is wrong.
export function resolveSceneGroup(sceneView) {
  const groups = (sceneView && sceneView.groups) || [];
  return {
    group: groups.length > 0 ? groups[0] : null,
    ambiguous: groups.length > 1,
    all: groups,
  };
}

function customFieldValue(fields) {
  return { __customField: true, fields: fields || {} };
}

function stashIdValue(stashIds, matchedIds) {
  return {
    __stashId: true,
    stashIds: stashIds || [],
    matchedIds: matchedIds,
  };
}

const YEAR_RE = /^(\d{4})/;
const MONTH_RE = /^(\d{4})-(\d{2})/;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

export function buildTokens(sceneView, config, matchedIds) {
  const chosenGroup = resolveSceneGroup(sceneView);
  const delimiters = config.delimiters || {};
  const chain = sceneView.studioNames || [];
  const matched = matchedIds || EMPTY_MATCHED_IDS;

  const studio = chain.length ? chain[chain.length - 1] : "";
  const studioRoot = chain.length ? chain[0] : "";
  const yearMatch = sceneView.date ? YEAR_RE.exec(sceneView.date) : null;
  const monthMatch = sceneView.date ? MONTH_RE.exec(sceneView.date) : null;
  const dayMatch = sceneView.date ? DAY_RE.exec(sceneView.date) : null;

  const sortBy = config.sortBy || "alphabetical";
  const sortedPerformers = sortEntities(
    sceneView.performers || [],
    sortBy,
    (p) => {
      return p.name;
    },
  );
  const sortedTags = sortEntities(sceneView.tags || [], "alphabetical", (t) => {
    return t.sort_name || t.name;
  });
  // compared against the raw name, before sanitizing strips characters the
  // title still contains
  const titleLower = (sceneView.title || "").toLowerCase();
  const performersNotInTitle = sortedPerformers.filter((p) => {
    return titleLower.indexOf((p.name || "").toLowerCase()) === -1;
  });

  const matchedPerformers = entitiesForIds(
    sortedPerformers,
    matched.performerIds,
  );
  const matchedTags = entitiesForIds(sortedTags, matched.tagIds);

  return {
    studio: sanitizeTokenValue(studio),
    studio_root: sanitizeTokenValue(studioRoot),
    // The one token deliberately exempt from having "/" stripped because it's supposed to build a directory hierarchy
    studio_hierarchy: chain.map((name) => sanitizeTokenValue(name)).join("/"),
    performers: listValue(sortedPerformers, delimiters.performers || ", "),
    performers_not_in_title: listValue(
      performersNotInTitle,
      delimiters.performers || ", ",
      sortedPerformers.length,
    ),
    matched_performers: listValue(
      matchedPerformers,
      delimiters.performers || ", ",
    ),
    tags: listValue(sortedTags, delimiters.tags || ", "),
    matched_tags: listValue(matchedTags, delimiters.tags || ", "),
    title: sanitizeTokenValue(sceneView.title || ""),
    code: sanitizeTokenValue(sceneView.code || ""),
    director: sanitizeTokenValue(sceneView.director || ""),
    photographer: sanitizeTokenValue(sceneView.photographer || ""),
    date: sanitizeTokenValue(sceneView.date || ""),
    date_year: yearMatch ? yearMatch[1] : "",
    date_month: monthMatch ? monthMatch[2] : "",
    date_day: dayMatch ? dayMatch[3] : "",
    resolution: sanitizeTokenValue(sceneView.resolution || ""),
    video_codec: sanitizeTokenValue(sceneView.videoCodec || ""),
    audio_codec: sanitizeTokenValue(sceneView.audioCodec || ""),
    bitrate:
      sceneView.bitrateMbps != null
        ? sceneView.bitrateMbps.toFixed(2) + "Mbps"
        : "",
    fps: sceneView.fps != null ? sceneView.fps + "fps" : "",
    phash: sanitizeTokenValue(sceneView.phash || ""),
    oshash: sanitizeTokenValue(sceneView.oshash || ""),
    rating:
      sceneView.rating100 != null ? (sceneView.rating100 / 10).toFixed(1) : "",
    stash_id: stashIdValue(sceneView.stashIds, matched),
    custom_field: customFieldValue(sceneView.customFields),
    group: chosenGroup.group ? sanitizeTokenValue(chosenGroup.group.name) : "",
    group_idx:
      chosenGroup.group && chosenGroup.group.sceneIndex != null
        ? String(chosenGroup.group.sceneIndex)
        : "",
    // overridden per pattern by renderPath: {current} means the current
    // folder in a folder pattern and the current basename in a filename one
    current: "",
  };
}

const TOKEN_REQUIREMENTS = {
  studio: {
    isMissing: (view) => view.studioNames.length === 0,
    message: "{noun} has no studio assigned",
  },
  studio_root: {
    isMissing: (view) => view.studioNames.length === 0,
    message: "{noun} has no studio assigned",
  },
  studio_hierarchy: {
    isMissing: (view) => view.studioNames.length === 0,
    message: "{noun} has no studio assigned",
  },
  performers: {
    isMissing: (view) => view.performerNames.length === 0,
    message: "{noun} has no performers assigned",
  },
  performers_not_in_title: {
    isMissing: (view) => view.performerNames.length === 0,
    message: "{noun} has no performers assigned",
  },
  matched_performers: {
    isMissing: (view, matchedIds) =>
      !matchedIds || matchedIds.performerIds.length === 0,
    message:
      "no performer from a matching rule condition was found on this scene",
  },
  tags: {
    isMissing: (view) => view.tagNames.length === 0,
    message: "{noun} has no tags assigned",
  },
  matched_tags: {
    isMissing: (view, matchedIds) =>
      !matchedIds || matchedIds.tagIds.length === 0,
    message: "no tag from a matching rule condition was found on this scene",
  },
  title: {
    isMissing: (view) => !view.title,
    message: "{noun} has no title",
  },
  code: {
    isMissing: (view) => !view.code,
    message: "{noun} has no code assigned",
  },
  director: {
    isMissing: (view) => !view.director,
    message: "{noun} has no director assigned",
  },
  photographer: {
    isMissing: (view) => !view.photographer,
    message: "{noun} has no photographer assigned",
  },
  date: {
    isMissing: (view) => !view.date,
    message: "{noun} has no date",
  },
  date_year: {
    isMissing: (view) => !YEAR_RE.test(view.date || ""),
    message: "{noun} has no date",
  },
  date_month: {
    isMissing: (view) => !MONTH_RE.test(view.date || ""),
    message: "{noun}'s date is year-only, with no month",
  },
  date_day: {
    isMissing: (view) => !DAY_RE.test(view.date || ""),
    message: "{noun}'s date isn't a full year-month-day date",
  },
  resolution: {
    isMissing: (view) => !view.resolution,
    message: "{noun}'s primary file has no resolution info",
  },
  video_codec: {
    isMissing: (view) => !view.videoCodec,
    message: "{noun}'s primary file has no video codec info",
  },
  audio_codec: {
    isMissing: (view) => !view.audioCodec,
    message: "{noun}'s primary file has no audio codec info",
  },
  bitrate: {
    isMissing: (view) => view.bitrateMbps == null,
    message: "{noun}'s primary file has no bitrate info",
  },
  fps: {
    isMissing: (view) => view.fps == null,
    message: "{noun}'s primary file has no framerate info",
  },
  phash: {
    isMissing: (view) => !view.phash,
    message: "{noun}'s primary file has no phash fingerprint",
  },
  oshash: {
    isMissing: (view) => !view.oshash,
    message: "{noun}'s primary file has no oshash fingerprint",
  },
  rating: {
    isMissing: (view) => view.rating100 == null,
    message: "{noun} has no rating",
  },
  group: {
    isMissing: (view) => resolveSceneGroup(view).group === null,
    message: "{noun} does not belong to any group",
  },
  group_idx: {
    isMissing: (view) => {
      const chosen = resolveSceneGroup(view).group;
      return !chosen || chosen.sceneIndex == null;
    },
    message: (view) => {
      const chosen = resolveSceneGroup(view).group;
      return chosen
        ? '{noun} has no place in the running order of "' + chosen.name + '"'
        : "{noun} does not belong to any group";
    },
  },
  // named rather than generic: a custom field that is empty on one item and
  // missing everywhere are the same skip, and only the name tells them apart
  custom_field: {
    isMissing: (view, matchedIds, parsed) => {
      return (
        customFieldText((view.customFields || {})[parsed.arg]).trim() === ""
      );
    },
    message: (view, matchedIds, parsed) => {
      return '{noun} has no value for the custom field "' + parsed.arg + '"';
    },
  },
  // all three hooks go through resolveStashIdSource so the reported reason can
  // never describe a different source than the one that was rendered
  stash_id: {
    isMissing: (view, matchedIds, parsed) => {
      const source = resolveStashIdSource(parsed, matchedIds);
      if (!source.endpoint) {
        return true;
      }
      return !(view.stashIds || []).some((s) => {
        return s.endpoint === source.endpoint;
      });
    },
    message: (view, matchedIds, parsed) => {
      const source = resolveStashIdSource(parsed, matchedIds);
      if (source.endpoint) {
        return "{noun} has no StashID from " + source.endpoint;
      }
      if (source.requested) {
        return (
          'no stash-box source named "' + source.requested + '" is configured'
        );
      }
      return "no stash-box source is configured for this rule's {stash_id} token";
    },
    endpoint: (view, matchedIds, parsed) => {
      return resolveStashIdSource(parsed, matchedIds).endpoint;
    },
  },
};

function parseParts(pattern) {
  const text = pattern || "";
  const parts = [];
  let lastIndex = 0;
  scanPattern(text).forEach((token) => {
    if (token.index > lastIndex) {
      parts.push({ type: "literal", text: text.slice(lastIndex, token.index) });
    }
    parts.push(Object.assign({ type: "token" }, token));
    lastIndex = token.index + token.raw.length;
  });
  if (lastIndex < text.length) {
    parts.push({ type: "literal", text: text.slice(lastIndex) });
  }
  return parts;
}

function splitBracketSegments(pattern) {
  const segments = [];
  let i = 0;
  while (i < pattern.length) {
    const openIndex = pattern.indexOf("<", i);
    if (openIndex === -1) {
      segments.push({ type: "plain", text: pattern.slice(i) });
      break;
    }
    const closeIndex = pattern.indexOf(">", openIndex + 1);
    if (closeIndex === -1) {
      segments.push({ type: "plain", text: pattern.slice(i) });
      break;
    }
    if (openIndex > i) {
      segments.push({ type: "plain", text: pattern.slice(i, openIndex) });
    }
    segments.push({
      type: "bracket",
      text: pattern.slice(openIndex + 1, closeIndex),
    });
    i = closeIndex + 1;
  }
  return segments;
}

function renderParts(parts, tokens) {
  let output = "";
  let optionalTokenCount = 0;
  let nonEmptyOptionalCount = 0;

  parts.forEach((part) => {
    if (part.type === "literal") {
      output += part.text;
      return;
    }

    // A malformed body ("{studio bogus}") renders as the literal text the user
    // typed, which is what an unknown token has always done. The scanner is
    // looser than the grammar so it can report these
    if (
      part.errors.length > 0 ||
      !Object.prototype.hasOwnProperty.call(tokens, part.name)
    ) {
      output += part.raw;
      return;
    }

    const rendered = renderTokenValue(tokens[part.name], part);
    if (part.optional) {
      optionalTokenCount++;
      if (rendered.text !== "") {
        nonEmptyOptionalCount++;
      }
    } else if (rendered.filteredEmpty) {
      // a required list token that a filter emptied counts toward the collapse
      // test exactly like an empty optional one, so "< [{performers|gender=female}]>"
      // drops the brackets instead of rendering "[]"
      optionalTokenCount++;
    }
    output += rendered.text;
  });

  return {
    output: output,
    optionalTokenCount: optionalTokenCount,
    nonEmptyOptionalCount: nonEmptyOptionalCount,
  };
}

function renderBracketAlternatives(text, tokens) {
  // "|" separates alternatives, but it also separates a token's modifiers, so
  // the split has to ignore any pipe inside braces:
  // <{performers|gender=female}|no women> is two alternatives, not three
  const alternatives = splitTopLevel(text, "|");
  for (let i = 0; i < alternatives.length; i++) {
    const parts = parseParts(alternatives[i]);
    const rendered = renderParts(parts, tokens);
    const collapses =
      rendered.optionalTokenCount > 0 && rendered.nonEmptyOptionalCount === 0;
    if (!collapses) {
      return rendered.output;
    }
  }
  return null;
}

export function renderTemplate(pattern, tokens) {
  const segments = splitBracketSegments(pattern || "");
  let output = "";
  segments.forEach((segment) => {
    if (segment.type === "bracket") {
      const result = renderBracketAlternatives(segment.text, tokens);
      if (result !== null) {
        output += result;
      }
      return;
    }
    output += renderParts(parseParts(segment.text), tokens).output;
  });
  return output;
}

export function patternUsesAnyToken(pattern, tokenNames) {
  return scanPattern(pattern).some((token) => {
    return tokenNames.indexOf(token.name) !== -1;
  });
}

// Which tokens hold a list of entities, and of what kind. Everything absent
// from here is plain text: no :N, no entity modifiers
const TOKEN_ENTITY_KINDS = {
  performers: "performer",
  performers_not_in_title: "performer",
  matched_performers: "performer",
  tags: "tag",
  matched_tags: "tag",
};

const LIST_TOKEN_NAMES = Object.keys(TOKEN_ENTITY_KINDS);

// Kinds that exist purely so a modifier can say what it applies to
const NON_LIST_TOKEN_KINDS = {
  stash_id: "stash_id",
  custom_field: "custom_field",
};

function modifierKindOf(tokenName) {
  return (
    TOKEN_ENTITY_KINDS[tokenName] || NON_LIST_TOKEN_KINDS[tokenName] || null
  );
}

export function tokenLabel(token) {
  return "{" + (token.arg == null ? token.name : "@" + token.arg) + "}";
}

export function patternsNeedStashIdDefault(patterns) {
  return (patterns || []).some((pattern) => {
    return scanPattern(pattern).some((token) => {
      return token.name === "stash_id" && !modifierValue(token, "from");
    });
  });
}

export function patternsUseStashIdSource(patterns) {
  return (patterns || []).some((pattern) => {
    return scanPattern(pattern).some((token) => {
      return token.name === "stash_id" && !!modifierValue(token, "from");
    });
  });
}

// Everything wrong with a pattern, in the order it appears
// Since a modifier that matches nothing renders empty rather than
// reporting missing data this is the only thing standing between
// a typo and a silently wrong filename, so we need to be clear
export function findPatternProblems(pattern, allowedTokens, options) {
  const allowed = allowedTokens || KNOWN_TOKENS;

  const stashBoxes = (options && options.stashBoxes) || null;
  const patternKind = (options && options.patternKind) || null;
  const problems = [];
  const add = (raw, message, blocking) => {
    problems.push({ raw: raw, message: message, blocking: !!blocking });
  };

  // {current} reads the path that the pattern is about to write, so anything
  // added around it is read back on the next run and added again. Refusing the
  // composition is what keeps a pattern a fixed point rather than a recurrence
  const usage = currentUsage(pattern);
  if (usage.uses && !usage.alone) {
    add(
      "{current}",
      "{current} has to be the whole pattern. Combined with anything else it" +
        " grows every time the rename runs, because the next run reads back the" +
        " name the last one wrote",
      true,
    );
  }
  if (usage.uses && usage.alone && usage.modified && patternKind === "folder") {
    add(
      "{current}",
      "a folder pattern can only use {current} on its own: rewriting the" +
        " folder a file already sits in would move it somewhere new every run",
      true,
    );
  }

  scanPattern(pattern).forEach((token) => {
    token.errors.forEach((message) => {
      add(token.raw, message, token.raw.indexOf("|") !== -1);
    });
    if (token.errors.length > 0) {
      return;
    }

    if (allowed.indexOf(token.name) === -1) {
      add(token.raw, "there is no {" + token.name + "} token", false);
      return;
    }

    const seen = {};
    const seenGroups = {};
    token.modifiers.forEach((modifier) => {
      if (seen[modifier.name]) {
        add(token.raw, "sets " + modifier.name + " more than once", true);
        return;
      }
      seen[modifier.name] = true;

      const spec = MODIFIERS[modifier.name];
      if (!spec) {
        add(
          token.raw,
          'there is no "' +
            modifier.name +
            '" modifier. Available: ' +
            knownModifierNames().join(", "),
          true,
        );
        return;
      }
      if (
        spec.appliesTo.indexOf("*") === -1 &&
        spec.appliesTo.indexOf(modifierKindOf(token.name)) === -1
      ) {
        add(
          token.raw,
          spec.targetsAllLists
            ? "a " +
                modifier.name +
                " only means something on a list token (" +
                LIST_TOKEN_NAMES.join(", ") +
                ")"
            : modifier.name +
                " only works on " +
                spec.appliesTo.join("/") +
                " tokens, and " +
                tokenLabel(token) +
                " is not one",
          spec.misuseBlocks !== false,
        );
        return;
      }
      if (spec.group) {
        const already = seenGroups[spec.group];
        if (already) {
          add(
            token.raw,
            "a token can only set its " +
              MODIFIER_GROUPS[spec.group] +
              " once, but this one uses both " +
              already +
              " and " +
              modifier.name,
            true,
          );
          return;
        }
        seenGroups[spec.group] = modifier.name;
      }
      if (spec.takesValue === "required" && modifier.value == null) {
        add(
          token.raw,
          modifier.name +
            " needs a value, as in " +
            tokenLabel(token).replace("}", "|" + modifier.name + "=...}"),
          true,
        );
        return;
      }
      if (spec.takesValue === "none" && modifier.value != null) {
        add(
          token.raw,
          modifier.name +
            " takes no value, write " +
            tokenLabel(token).replace("}", "|" + modifier.name + "}"),
          true,
        );
        return;
      }
      const parsed = spec.parseValue
        ? spec.parseValue(modifier.value)
        : { ok: true, value: modifier.value };
      if (!parsed.ok) {
        add(token.raw, parsed.message, true);
        return;
      }
      if (modifier.name === "from") {
        addStashBoxProblems(add, token, parsed.value, stashBoxes);
      }
    });
  });

  return problems;
}

function addStashBoxProblems(add, token, value, stashBoxes) {
  if (!stashBoxes) {
    return;
  }
  if (looksLikeEndpoint(value)) {
    const known = stashBoxes.some((b) => {
      return b && b.endpoint === value;
    });
    if (!known) {
      add(
        token.raw,
        "no stash-box source configured in Stash uses that URL. It will still" +
          " work if your " +
          token.name.replace("_", " ") +
          "s carry IDs from it",
        false,
      );
    }
    return;
  }
  const wanted = value.toLowerCase();
  const hit = stashBoxes.some((b) => {
    return (
      b &&
      String(b.name || "")
        .trim()
        .toLowerCase() === wanted
    );
  });
  if (hit) {
    return;
  }
  if (stashBoxes.length === 0) {
    add(
      token.raw,
      "there are no stash-box sources configured in Stash yet. Add one under" +
        " Settings > Metadata Providers first",
      true,
    );
    return;
  }
  add(
    token.raw,
    'there is no stash-box source named "' +
      value +
      '". Configured: ' +
      stashBoxes
        .map((b) => {
          return b.name;
        })
        .join(", "),
    true,
  );
}

export function findUnknownTokens(pattern, allowedTokens) {
  const allowed = allowedTokens || KNOWN_TOKENS;
  const unknown = [];
  scanPattern(pattern).forEach((token) => {
    if (
      allowed.indexOf(token.name) === -1 &&
      unknown.indexOf(token.name) === -1
    ) {
      unknown.push(token.name);
    }
  });
  return unknown;
}

// Tokens that exist for every entity type. stash_id is excluded because only
// scenes have stash_ids, and the file-tech tokens because what a file can
// report differs per type. director drops out here because galleries and
// images have the equivalent "photographer" field instead, added on below
export const METADATA_TOKENS = KNOWN_TOKENS.filter((t) => {
  return (
    FILE_TECH_TOKENS.indexOf(t) === -1 &&
    t !== "phash" &&
    t !== "stash_id" &&
    t !== "group" &&
    t !== "group_idx" &&
    t !== "director"
  );
}).concat(["photographer"]);

// The full token vocabulary across every entity type, scene-only and
// gallery/image-only alike. KNOWN_TOKENS alone underclaims (it's the scene
// list) and so does METADATA_TOKENS (it's missing director); doc coverage and
// the pattern reference need the union so nothing goes undocumented
export const ALL_TOKENS = KNOWN_TOKENS.concat(
  METADATA_TOKENS.filter((t) => {
    return KNOWN_TOKENS.indexOf(t) === -1;
  }),
);

export function hasUnsafeOptionalOnlyBasename(filenamePattern) {
  const tokens = scanPattern(filenamePattern);
  return (
    tokens.length > 0 &&
    tokens.every((token) => {
      return token.optional;
    })
  );
}

function tokenSignature(token) {
  return (
    token.name +
    (token.arg == null ? "" : "@" + token.arg) +
    "\u0000" +
    (token.modifiers || [])
      .map((m) => {
        return m.raw;
      })
      .join("\u0000")
  );
}

export function findMissingRequiredData(patterns, sceneView, matchedIds, noun) {
  const subject = noun || "scene";
  const missing = [];
  const seen = {};
  const seenMessages = {};
  patterns.forEach((pattern) => {
    scanPattern(pattern).forEach((token) => {
      const signature = tokenSignature(token);
      if (token.optional || seen[signature]) {
        return;
      }
      const requirement = TOKEN_REQUIREMENTS[token.name];
      const effectiveMatchedIds = matchedIds || EMPTY_MATCHED_IDS;
      if (
        requirement &&
        requirement.isMissing(sceneView, effectiveMatchedIds, token)
      ) {
        seen[signature] = true;
        const message = (
          typeof requirement.message === "function"
            ? requirement.message(sceneView, effectiveMatchedIds, token)
            : requirement.message
        ).replace(/\{noun\}/g, subject);
        if (!seenMessages[message]) {
          const entry = { token: token.name, message: message };
          // carried structurally so the UI can resolve a display name for it
          if (typeof requirement.endpoint === "function") {
            const endpoint = requirement.endpoint(
              sceneView,
              effectiveMatchedIds,
              token,
            );
            if (endpoint) {
              entry.endpoint = endpoint;
            }
          }
          missing.push(entry);
          seenMessages[message] = true;
        }
      }
    });
  });
  return missing;
}

// A performer's name is not what identifies them: Stash's unique key is the
// name and disambiguation together, so two performers can share a name and a
// pattern rendering the name alone sends both to the same place. Advisory
// rather than blocking, because the pattern is ambiguous, not wrong, and only
// the user knows whether they care.
//
// Each token is asked what it actually renders, so a performer that gender= or
// limit= dropped raises nothing: the question is which names reach the path,
// not who is on the scene.
export function findDisambiguationRisks(
  patterns,
  sceneView,
  config,
  matchedIds,
) {
  const tokens = buildTokens(sceneView, config, matchedIds);
  const risks = [];
  const disambiguated = {};
  const warned = {};
  // The patterns are visited outermost first, and each is settled before the
  // next: a performer told apart by the folder is already in a folder of their
  // own, so repeating their bare name deeper down or in the filename cannot
  // send anyone anywhere new. The reverse does not hold, which is why the
  // filename cannot settle a folder that shares its name between two people
  (patterns || []).forEach((pattern) => {
    const rendered = scanPattern(pattern)
      .filter((token) => {
        return modifierKindOf(token.name) === "performer";
      })
      .map((token) => {
        const value = tokens[token.name];
        const pairs =
          value && value.__list
            ? value.entities.map((e) => {
                return { entity: e, name: sanitizeTokenValue(e.name) };
              })
            : [];
        return { token: token, pairs: applyListModifiers(pairs, token) };
      });
    // Within one pattern the order of the tokens is not the order of the
    // nesting, so every disambiguating token has its say before anything is
    // held against a bare one
    rendered.forEach((entry) => {
      if (!hasModifier(entry.token, "disambiguate")) {
        return;
      }
      entry.pairs.forEach((pair) => {
        disambiguated[pair.entity.id] = true;
      });
    });
    rendered.forEach((entry) => {
      if (hasModifier(entry.token, "disambiguate")) {
        return;
      }
      entry.pairs.forEach((pair) => {
        const disambiguation = String(pair.entity.disambiguation || "").trim();
        if (
          !disambiguation ||
          disambiguated[pair.entity.id] ||
          warned[pair.entity.id]
        ) {
          return;
        }
        warned[pair.entity.id] = true;
        risks.push({
          token: entry.token.name,
          name: pair.entity.name,
          disambiguation: disambiguation,
        });
      });
    });
  });
  return risks;
}

export function joinPath(root, folder) {
  const rawRoot = root || "";
  const isWindowsRoot = rawRoot.indexOf("\\") !== -1;
  const sep = isWindowsRoot ? "\\" : "/";
  const cleanRoot = rawRoot.replace(/[\\/]+$/, "");
  let cleanFolder = (folder || "").replace(/^[\\/]+|[\\/]+$/g, "");
  if (isWindowsRoot) {
    cleanFolder = cleanFolder.replace(/\//g, "\\");
  }
  return cleanFolder ? cleanRoot + sep + cleanFolder : cleanRoot;
}

// Should only be used for comparisons and not to create paths for renaming
// needed for Windows compatibility
export function normalizePathForCompare(p) {
  return (p || "").replace(/\\/g, "/").replace(/\/+$/, "");
}

// Joins a folder to a basename using the separator the folder itself uses, so a
// Windows path is not rendered with a stray forward slash before the filename
export function joinBasename(folder, basename) {
  const f = folder || "";
  if (!f) {
    return basename;
  }
  const sep = f.indexOf("\\") !== -1 ? "\\" : "/";
  return f.replace(/[\\/]+$/, "") + sep + basename;
}

// How {current} is written in a pattern. `alone` is the only legal shape:
// concatenated with anything else the pattern grows every run, because the next
// run reads back what the last one wrote --
//   {current}/{date_year}   folder/name -> .../2024 -> .../2024/2024 -> ...
export function currentUsage(pattern) {
  const text = pattern == null ? "" : String(pattern);
  const tokens = scanPattern(text);
  const currents = tokens.filter((t) => {
    return t.name === "current";
  });
  if (currents.length === 0) {
    return { uses: false, alone: false, modified: false };
  }
  let literal = "";
  let last = 0;
  tokens.forEach((t) => {
    literal += text.slice(last, t.index);
    last = t.index + t.raw.length;
  });
  literal += text.slice(last);
  return {
    uses: true,
    alone: tokens.length === 1 && literal.trim() === "",
    modified: currents[0].modifiers.length > 0,
  };
}

function keepsCurrent(raw) {
  const usage = currentUsage(raw);
  return usage.uses && usage.alone && !usage.modified;
}

// "keep" is no longer a blank pattern but one that is exactly {current}: the
// file stays in the folder it already occupies, which needs no library root and
// lets the move go by folder id rather than by a path we assembled
export function folderPatternMode(folderPattern) {
  const raw = (folderPattern == null ? "" : String(folderPattern)).trim();
  if (raw === "") return "blank";
  if (/^[\\/]+$/.test(raw)) return "root";
  return keepsCurrent(raw) ? "keep" : "render";
}

// A filename of exactly {current} keeps the name byte for byte. Given a
// modifier it is a rename like any other, and is sanitised like one
export function filenamePatternMode(filenamePattern) {
  const raw = (filenamePattern == null ? "" : String(filenamePattern)).trim();
  if (raw === "") return "blank";
  return keepsCurrent(raw) ? "keep" : "render";
}

function filenameHasContentWithout(
  filenamePattern,
  tokens,
  excludeTokenNames,
  sanitizeOptions,
) {
  const probeTokens = Object.assign({}, tokens);
  excludeTokenNames.forEach((name) => {
    if (Object.prototype.hasOwnProperty.call(probeTokens, name)) {
      probeTokens[name] = "";
    }
  });
  const rendered = renderTemplate(filenamePattern, probeTokens);
  return sanitizeSegmentRaw(rendered, sanitizeOptions) !== "";
}

// `currentPath` is { folder, basename }, the path this file already has, with the
// basename stripped of its extension. {current} resolves to a different one of
// those in each pattern, which is why the token map is rebuilt per pattern
// rather than shared between them
export function renderPath(
  folderPattern,
  filenamePattern,
  sceneView,
  config,
  matchedIds,
  currentPath,
) {
  const base = buildTokens(sceneView, config, matchedIds);
  const from = currentPath || { folder: "", basename: "" };
  const tokens = Object.assign({}, base, { current: from.folder });
  const filenameTokens = Object.assign({}, base, { current: from.basename });
  // a kept name is already legal on disk, so replacing its spaces would be the
  // rename that {current} on its own promises not to make. Asking for a
  // modifier is asking for a rename, and that is sanitised like any other
  const sanitizeOptions =
    filenamePatternMode(filenamePattern) === "keep"
      ? Object.assign({}, config.sanitize || {}, { spaceReplacement: "" })
      : config.sanitize || {};

  const renderedFolder = renderTemplate(folderPattern || "", tokens);
  // Windows users write their folder patterns with backslashes, so both count as
  // a nesting separator. Token values can never smuggle one in: sanitizeTokenValue
  // strips both, and {studio_hierarchy}, the one exemption, emits "/" by design
  const folderSegments = renderedFolder
    .split(/[\\/]/)
    .filter((s) => {
      return s.length > 0;
    })
    .map((segment) => {
      return sanitizeSegment(segment, sanitizeOptions);
    });

  const renderedFilename = renderTemplate(
    filenamePattern || "",
    filenameTokens,
  );
  const basenameNoExt = sanitizeSegment(renderedFilename, sanitizeOptions);
  const basenameHasContent =
    sanitizeSegmentRaw(renderedFilename, sanitizeOptions) !== "";
  const basenameHasMetadataContent = filenameHasContentWithout(
    filenamePattern || "",
    filenameTokens,
    FILE_TECH_TOKENS,
    sanitizeOptions,
  );
  return {
    folder: folderSegments.join("/"),
    basenameNoExt: basenameNoExt,
    basenameHasContent: basenameHasContent,
    basenameHasMetadataContent: basenameHasMetadataContent,
  };
}

export function describePatternPair(folderPattern, filenamePattern) {
  const folder = folderPattern || "";
  const filename = filenamePattern || "";
  return folder ? folder + "/" + filename : filename;
}
