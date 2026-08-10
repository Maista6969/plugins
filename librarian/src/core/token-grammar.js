// The token grammar (so far)
//
//   { name ( ":" digits )? ( "|" modifier )* "?"? }
//   modifier := key ( "=" value )?
//
// Examples: {title}  {performers|limit=2}  {title?}  {performers|gender=female|uppercase?}
//
// ":N" is the original spelling of the limit. It is deprecated and desugars to
// a leading "|limit=N", which is exactly what its position means now that
// modifiers run left to right; "?" is still always the last character before
// the closing brace
//
// Deliberately parsed in two stages rather than by one big regex: a modifier
// value can legitimately contain ":", "|" and "?" (a regex= modifier certainly
// would), which a monolithic pattern cannot disambiguate. The split on "|" is
// not opaque-span aware yet, so that modifier needs this to be revisited first

import {
  parseGenderValue,
  genderOf,
  GENDER_VALUES,
  UNKNOWN_GENDER,
} from "./gender.js";

// Looser than the grammar on purpose, so that "{foo bar}" is seen and can be
// reported as malformed instead of being silently invisible
// promise we'll never support nested tokens lol
export const TOKEN_SCAN = /\{(\w+)([^{}]*)\}/;

// Modifiers that answer the same question, so a token may only use one of each
export const MODIFIER_GROUPS = { case: "capitalisation" };

function titleCase(text) {
  return text.replace(/\S+/g, (word) => {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

// The value modifiers are all the same shape:
// any token, no value, one string in and one string out
function valueModifier(applyValue, group) {
  return {
    input: "value",
    appliesTo: ["*"],
    takesValue: "none",
    group: group || null,
    applyValue: applyValue,
  };
}

// Modifiers, keyed by name
//   input      what the modifier consumes. This is a type signature, not a
//              schedule: "list" needs the entities, "value" transforms one
//              rendered string at a time, "source" picks which value the token
//              resolves to at all and is consumed by the token's own
//              resolution. Modifiers otherwise run strictly left to right, in
//              the order they were written, so
//              {performers|limit=1|gender=female} and
//              {performers|gender=female|limit=1} are different and each means
//              what it reads like
//   appliesTo  entity kinds the modifier is meaningful for ("*" for any), which
//              is what makes {title|gender=female} an error and not a no-op
//   takesValue "required" or "none"
//   group      a MODIFIER_GROUPS key when the modifier excludes its siblings
//   parseValue turns the written value into whatever apply wants, or explains
//              why it can't. Its message is the only documentation most users
//              will ever see for the valid values. Omitted when takesValue is
//              "none" and there is nothing to parse
//   applyList  filters or reorders {entity, name} pairs ("list" input)
//   applyValue rewrites one string ("value" input)
export const MODIFIERS = {
  limit: {
    input: "list",
    appliesTo: ["performer", "tag"],
    takesValue: "required",
    // users pick these tokens by name, not by entity kind, so the "wrong token"
    // message enumerates the list tokens instead of saying "performer/tag"
    targetsAllLists: true,
    // a limit on a token that has no list is a provable no-op rather than a
    // wrong filename, so unlike every other modifier mistake it does not block
    misuseBlocks: false,
    parseValue: function (raw) {
      const text = String(raw == null ? "" : raw).trim();
      if (!/^\d+$/.test(text)) {
        return {
          ok: false,
          message: "limit needs a whole number, as in {performers|limit=2}",
        };
      }
      return { ok: true, value: parseInt(text, 10) };
    },
    applyList: function (pairs, raw) {
      const parsed = MODIFIERS.limit.parseValue(raw);
      if (!parsed.ok) {
        return pairs;
      }
      return pairs.slice(0, parsed.value);
    },
  },
  gender: {
    input: "list",
    appliesTo: ["performer"],
    takesValue: "required",
    parseValue: function (raw) {
      const wanted = [];
      const invalid = [];
      String(raw == null ? "" : raw)
        .split(",")
        .forEach((part) => {
          const text = part.trim();
          if (!text) {
            return;
          }
          const value = parseGenderValue(text);
          if (!value) {
            invalid.push(text);
          } else if (wanted.indexOf(value) === -1) {
            wanted.push(value);
          }
        });
      if (invalid.length > 0) {
        return {
          ok: false,
          message:
            (invalid.length === 1
              ? "there is no gender "
              : "there are no genders ") +
            invalid
              .map((v) => {
                return '"' + v + '"';
              })
              .join(", ") +
            ". Use one or more of: " +
            GENDER_VALUES.join(", ") +
            ' ("' +
            UNKNOWN_GENDER +
            '" being performers with no gender set)',
        };
      }
      if (wanted.length === 0) {
        return { ok: false, message: "gender= needs at least one gender" };
      }
      return { ok: true, value: wanted };
    },
    applyList: function (pairs, raw) {
      const parsed = MODIFIERS.gender.parseValue(raw);
      if (!parsed.ok) {
        return pairs;
      }
      return pairs.filter((pair) => {
        return parsed.value.indexOf(genderOf(pair.entity)) !== -1;
      });
    },
  },
  uppercase: valueModifier(function (text) {
    return text.toUpperCase();
  }, "case"),
  lowercase: valueModifier(function (text) {
    return text.toLowerCase();
  }, "case"),
  titlecase: valueModifier(titleCase, "case"),
  compact: valueModifier(function (text) {
    return text.replace(/\s+/g, "");
  }),
  from: {
    input: "source",
    appliesTo: ["stash_id"],
    takesValue: "required",
    // Only the shape can be checked here: whether a name actually exists is a
    // question about the user's Stash config, which the registry never sees
    // findPatternProblems does that part
    parseValue: function (raw) {
      const text = String(raw == null ? "" : raw).trim();
      if (!text) {
        return {
          ok: false,
          message: "from= needs a stash-box name, like {stash_id|from=StashDB}",
        };
      }
      return { ok: true, value: text };
    },
  },
};

export function knownModifierNames() {
  return Object.keys(MODIFIERS).sort();
}

// The value written for a modifier, or null when the token does not carry it
// Keeps callers off parsed.modifiers internals
export function modifierValue(parsed, name) {
  const found = ((parsed && parsed.modifiers) || []).filter((m) => {
    return m.name === name;
  });
  return found.length > 0 ? found[0].value : null;
}

export function splitTopLevel(text, separator) {
  const parts = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === "{") {
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
    }
    if (ch === separator && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

// `body` is everything between the token name and the closing brace
export function parseToken(name, body, index, raw) {
  const token = {
    name: name,
    raw: raw,
    index: index,
    optional: false,
    modifiers: [],
    errors: [],
    warnings: [],
  };

  let text = body || "";
  if (text.charAt(text.length - 1) === "?") {
    token.optional = true;
    text = text.slice(0, -1);
  }

  const chunks = text.split("|");
  const head = chunks.shift();
  if (head !== "") {
    const limitMatch = /^:(\d+)$/.exec(head);
    if (limitMatch) {
      // desugared rather than kept as its own field: ":N" sits at the front of
      // the token, and the front is where a left-to-right limit runs
      token.modifiers.push({
        name: "limit",
        value: limitMatch[1],
        raw: head,
      });
      token.warnings.push(
        ":" +
          limitMatch[1] +
          " is deprecated, write {" +
          name +
          "|limit=" +
          limitMatch[1] +
          (chunks.length > 0 ? "|" + chunks.join("|") : "") +
          "} instead. Modifiers now apply left to right, so a limit written" +
          " first is applied first",
      );
    } else if (head.indexOf("?") !== -1) {
      token.errors.push(
        "the ? has to be the last thing before the closing brace, as in {" +
          name +
          "|...?}",
      );
    } else {
      token.errors.push(
        "don't know what \"" +
          head.replace(/^:/, "") +
          '" means here: a modifier is written as {' +
          name +
          "|name=value}",
      );
    }
  }

  chunks.forEach((chunk) => {
    if (chunk === "") {
      token.errors.push("there is an empty modifier between two | separators");
      return;
    }
    const eq = chunk.indexOf("=");
    const key = eq === -1 ? chunk : chunk.slice(0, eq);
    if (!/^\w+$/.test(key)) {
      token.errors.push('"' + chunk + '" is not a valid modifier');
      return;
    }
    token.modifiers.push({
      name: key,
      value: eq === -1 ? null : chunk.slice(eq + 1),
      raw: chunk,
    });
  });

  return token;
}

export function scanPattern(pattern) {
  const regex = new RegExp(TOKEN_SCAN.source, "g");
  const tokens = [];
  let match;
  while ((match = regex.exec(pattern || "")) !== null) {
    tokens.push(parseToken(match[1], match[2], match.index, match[0]));
  }
  return tokens;
}

// Entities and their rendered names travel together so that a "value" modifier
// can rewrite a name without hiding the entity a later "list" modifier still
// has to test: {performers|uppercase|gender=female} filters on the performer's
// own gender field, not on the shouting version of their name
export function applyListModifiers(pairs, parsed) {
  let result = pairs;
  (parsed.modifiers || []).forEach((modifier) => {
    const spec = MODIFIERS[modifier.name];
    if (!spec) {
      return;
    }
    if (spec.input === "list") {
      result = spec.applyList(result, modifier.value);
    } else if (spec.input === "value") {
      result = result.map((pair) => {
        return { entity: pair.entity, name: spec.applyValue(pair.name) };
      });
    }
  });
  return result;
}

export function applyValueModifiers(text, parsed) {
  let result = text;
  (parsed.modifiers || []).forEach((modifier) => {
    const spec = MODIFIERS[modifier.name];
    if (spec && spec.input === "value") {
      result = spec.applyValue(result);
    }
  });
  return result;
}
