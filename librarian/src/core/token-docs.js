// The prose half of the token vocabulary, kept next to the behaviour it
// describes rather than in the component that happens to render it.
//
// Three surfaces read this: the pattern editor's token chips, the in-app
// pattern reference, and scripts/generate-docs.mjs, which writes the README's
// tables. Generating all three from one place is what stops the documentation
// drifting away from what the code actually does, and doc-coverage.test.js
// fails the build if a token or modifier is added without an entry here.
//
// "{noun}" is substituted with the entity noun ("scene", "gallery", "image")
// by describeToken, so one description serves all three types

import { KNOWN_TOKENS, FILE_TECH_TOKENS } from "./path-template.js";
import { MODIFIERS } from "./token-grammar.js";

export const TOKEN_DESCRIPTIONS = {
  studio: "The {noun}'s own studio",
  studio_root:
    "The TOP of the studio hierarchy (often the network), not the {noun}'s own",
  studio_hierarchy:
    "The full studio chain from top to bottom, joined with “/” (e.g. “BangBros/Public Bang”)",
  performers:
    "All performers on the {noun}, sorted per this rule's “Sort performers by” setting, joined with a comma",
  performers_not_in_title:
    "Performers not already named in the {noun}'s title. It would not include “Joy” if the title is “A Day in the Park with Joy”",
  matched_performers:
    "Only the performer(s) that actually satisfied THIS rule's own performer condition, not every performer on the {noun}",
  tags: "All tags on the {noun}, joined with a comma",
  matched_tags:
    "Only the tag(s) that actually satisfied THIS rule's own tag condition, not every tag on the {noun}",
  title: "The {noun}'s title",
  code: "The {noun}'s own “Studio Code”, not that very few studios actually have these",
  date: "The {noun}'s date, can be partial",
  date_year: "Just the year of the date, e.g. “2024”",
  date_month:
    "Just the month of the date, e.g. “05”, can be missing if date is partial",
  date_day:
    "Just the day of the date, e.g. “10”, can be missing if the {noun} has a partial date",
  resolution:
    "The file's resolution, e.g. “1080p” or “4K”. Can differ per file on a multi-file {noun}",
  video_codec:
    "The file's video codec, e.g. “h264”, “hevc”. Can differ per file on a multi-file {noun}",
  audio_codec:
    "The file's audio codec, e.g. “aac”. Can differ per file on a multi-file {noun}",
  bitrate:
    "The file's bitrate, e.g. “8.42Mbps”. Can differ per file on a multi-file {noun}",
  fps: "The file's framerate, e.g. “30fps” or “23.98fps”. Can differ per file on a multi-file {noun}",
  phash:
    "The file's perceptual hash fingerprint. Can differ per file on a multi-file {noun}",
  oshash:
    "The file's oshash fingerprint (Stash's older, pre-phash identifier, still computed for every video). Can differ per file on a multi-file {noun}",
  rating: "The {noun}'s rating on a 0-10 scale (one decimal place)",
  stash_id:
    "The {noun}'s StashID. Add |from=StashDB to name the source, or leave it off to use the “Default StashID source” picked below",
};

export function describeToken(name, noun) {
  const text = TOKEN_DESCRIPTIONS[name] || "";
  return text.replace(/\{noun\}/g, noun || "scene");
}

// Which tokens a modifier is meaningful for, phrased the way a user picks them
// (by token name) rather than the way appliesTo stores it (by entity kind)
const TARGET_LABELS = {
  "*": "any token",
  performer: "the performer tokens",
  "performer,tag": "list tokens",
  stash_id: "{stash_id}",
};

function targetLabel(spec) {
  const key = spec.appliesTo.slice().sort().join(",");
  return TARGET_LABELS[key] || spec.appliesTo.join("/") + " tokens";
}

// Every modifier, in the order the reference should list them: the ones that
// pick which values survive before the ones that rewrite the text
const MODIFIER_ORDER = [
  "limit",
  "gender",
  "uppercase",
  "lowercase",
  "titlecase",
  "compact",
  "regex",
  "from",
];

export function describeModifiers() {
  const known = Object.keys(MODIFIERS);
  const ordered = MODIFIER_ORDER.filter((name) => {
    return known.indexOf(name) !== -1;
  }).concat(
    known
      .filter((name) => {
        return MODIFIER_ORDER.indexOf(name) === -1;
      })
      .sort(),
  );
  return ordered.map((name) => {
    const spec = MODIFIERS[name];
    return {
      name: name,
      // how it is written, so the reference shows =value only where one is taken
      spelling: spec.takesValue === "required" ? name + "=" : name,
      targets: targetLabel(spec),
      summary: spec.summary || "",
      example: spec.example || null,
    };
  });
}

export function describeTokens(tokenNames, noun) {
  return (tokenNames || KNOWN_TOKENS).map((name) => {
    return {
      name: name,
      description: describeToken(name, noun),
      fileTech: FILE_TECH_TOKENS.indexOf(name) !== -1 || name === "phash",
    };
  });
}
