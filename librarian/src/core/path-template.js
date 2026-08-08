import { sortEntities } from "./entity-sort.js";
import {
  scanPattern,
  splitTopLevel,
  applyEntityModifiers,
  applyTextModifiers,
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
  "date",
  "date_year",
  "date_month",
  "date_day",
  "rating",
  "stash_id",
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

// Multi-value tokens carry their entities rather than a pre-joined string, so a
// modifier can filter on fields other than the name. A marker property rather
// than a class keeps this Goja-safe
function listValue(entities, delimiter) {
  return { __list: true, entities: entities, delimiter: delimiter };
}

// The one place a token turns into text. Order is fixed: filter, then limit,
// then sanitize each name, then join, then rewrite the result
function renderTokenValue(value, parsed) {
  if (value && value.__list) {
    let entities = applyEntityModifiers(value.entities, parsed);
    if (parsed.limit != null) {
      entities = entities.slice(0, parsed.limit);
    }
    const names = entities.map((e) => {
      return sanitizeTokenValue(e.name);
    });
    return applyTextModifiers(names.join(value.delimiter), parsed);
  }
  // plain strings, and the probe maps filenameHasContentWithout builds
  return applyTextModifiers(String(value), parsed);
}

const YEAR_RE = /^(\d{4})/;
const MONTH_RE = /^(\d{4})-(\d{2})/;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

export function buildTokens(sceneView, config, matchedIds) {
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

  const stashBoxEndpoint = matched.stashBoxEndpoint || "";
  const stashIdEntry = stashBoxEndpoint
    ? (sceneView.stashIds || []).find((s) => {
        return s.endpoint === stashBoxEndpoint;
      })
    : null;

  return {
    studio: sanitizeTokenValue(studio),
    studio_root: sanitizeTokenValue(studioRoot),
    // The one token deliberately exempt from having "/" stripped because it's supposed to build a directory hierarchy
    studio_hierarchy: chain.map((name) => sanitizeTokenValue(name)).join("/"),
    performers: listValue(sortedPerformers, delimiters.performers || ", "),
    performers_not_in_title: listValue(
      performersNotInTitle,
      delimiters.performers || ", ",
    ),
    matched_performers: listValue(
      matchedPerformers,
      delimiters.performers || ", ",
    ),
    tags: listValue(sortedTags, delimiters.tags || ", "),
    matched_tags: listValue(matchedTags, delimiters.tags || ", "),
    title: sanitizeTokenValue(sceneView.title || ""),
    code: sanitizeTokenValue(sceneView.code || ""),
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
    stash_id: sanitizeTokenValue(stashIdEntry ? stashIdEntry.stash_id : ""),
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
  stash_id: {
    isMissing: (view, matchedIds) => {
      const endpoint = (matchedIds && matchedIds.stashBoxEndpoint) || "";
      if (!endpoint) {
        return true;
      }
      return !(view.stashIds || []).some((s) => {
        return s.endpoint === endpoint;
      });
    },
    message: (view, matchedIds) => {
      const endpoint = (matchedIds && matchedIds.stashBoxEndpoint) || "";
      return endpoint
        ? "{noun} has no StashID from " + endpoint
        : "no stash-box source is configured for this rule's {stash_id} token";
    },
    endpoint: (view, matchedIds) => {
      return (matchedIds && matchedIds.stashBoxEndpoint) || "";
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
    // looser than the grammar so it can *report* these; it must not start
    // rendering them as if the junk were not there
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
      if (rendered !== "") {
        nonEmptyOptionalCount++;
      }
    }
    output += rendered;
  });

  return {
    output: output,
    optionalTokenCount: optionalTokenCount,
    nonEmptyOptionalCount: nonEmptyOptionalCount,
  };
}

function renderBracketAlternatives(text, tokens) {
  // "|" separates alternatives, but it also separates a token's modifiers, so
  // the split has to ignore any pipe inside braces
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
// report differs per type
export const METADATA_TOKENS = KNOWN_TOKENS.filter((t) => {
  return (
    FILE_TECH_TOKENS.indexOf(t) === -1 && t !== "phash" && t !== "stash_id"
  );
});

export function hasUnsafeOptionalOnlyBasename(filenamePattern) {
  const tokens = scanPattern(filenamePattern);
  return (
    tokens.length > 0 &&
    tokens.every((token) => {
      return token.optional;
    })
  );
}

export function findMissingRequiredData(patterns, sceneView, matchedIds, noun) {
  const subject = noun || "scene";
  const missing = [];
  const seen = {};
  const seenMessages = {};
  patterns.forEach((pattern) => {
    scanPattern(pattern).forEach((token) => {
      const tokenName = token.name;
      if (token.optional || seen[tokenName]) {
        return;
      }
      const requirement = TOKEN_REQUIREMENTS[tokenName];
      const effectiveMatchedIds = matchedIds || EMPTY_MATCHED_IDS;
      if (
        requirement &&
        requirement.isMissing(sceneView, effectiveMatchedIds)
      ) {
        seen[tokenName] = true;
        const message = (
          typeof requirement.message === "function"
            ? requirement.message(sceneView, effectiveMatchedIds)
            : requirement.message
        ).replace(/\{noun\}/g, subject);
        if (!seenMessages[message]) {
          const entry = { token: tokenName, message: message };
          // carried structurally so the UI can resolve a display name for it
          if (typeof requirement.endpoint === "function") {
            const endpoint = requirement.endpoint(
              sceneView,
              effectiveMatchedIds,
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

export function folderPatternMode(folderPattern) {
  const raw = (folderPattern == null ? "" : String(folderPattern)).trim();
  if (raw === "") return "keep";
  if (/^[\\/]+$/.test(raw)) return "root";
  return "render";
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

export function renderPath(
  folderPattern,
  filenamePattern,
  sceneView,
  config,
  matchedIds,
) {
  const tokens = buildTokens(sceneView, config, matchedIds);
  const sanitizeOptions = config.sanitize || {};

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

  const renderedFilename = renderTemplate(filenamePattern || "", tokens);
  const basenameNoExt = sanitizeSegment(renderedFilename, sanitizeOptions);
  const basenameHasContent =
    sanitizeSegmentRaw(renderedFilename, sanitizeOptions) !== "";
  const basenameHasMetadataContent = filenameHasContentWithout(
    filenamePattern || "",
    tokens,
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
