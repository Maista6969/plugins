// The token grammar (so far)
//
//   { name ( ":" digits )? ( "|" modifier )* "?"? }
//   { "@" field ( "|" modifier )* "?"? }
//   modifier := key ( "=" value )?
//
// Examples: {title}  {performers|limit=2}  {title?}  {performers|gender=female|uppercase?}
//           {@Series}  {@Release Group}  {@Episode?}  {@Series|uppercase}
//
// The "@" form names a custom field, which is the one piece of metadata whose
// names come from the user's own library rather than from Stash's schema. It
// parses to the ordinary token "custom_field" carrying the name as `arg`, so
// every registry downstream stays keyed by a name that is known at build time:
// only resolving the value, and saying which field was missing, read the arg.
// The field name runs to the first "|", "?" or "}", which is what lets it
// contain the spaces that real field names have
//
// ":N" is the original spelling of the limit and still works, but only when it
// is the whole body: it desugars to a leading "|limit=N", and with nothing else
// on the token there is no ordering for that to disagree with. Alongside any
// modifier it is refused, because it always runs first while reading like a cap
// on the finished list. "?" is still always the last character before the
// closing brace
//
// Deliberately parsed in two stages rather than by one big regex: a modifier
// value can legitimately contain ":", "|" and "?" (a regex= modifier certainly
// would), which a monolithic pattern cannot disambiguate. The split on "|" is
// not opaque-span aware yet, so that modifier needs this to be revisited first

import { parseGenderValue, genderOf, GENDER_VALUES } from "./gender.js";

// Looser than the grammar on purpose, so that "{foo bar}" is seen and can be
// reported as malformed instead of being silently invisible
// promise we'll never support nested tokens lol
// Only used to find where a token starts; where it ends is findTokenEnd's job,
// because a regex= value may contain the braces of a {2} quantifier
export const TOKEN_START = /^\{(\w+)/;

export const CUSTOM_FIELD_TOKEN = "custom_field";
const CUSTOM_TOKEN_START = /^\{@([^|?}]*)/;

// Modifiers that answer the same question, so a token may only use one of each
export const MODIFIER_GROUPS = { case: "capitalisation" };

// code and values let the UI say a problem in the viewer's language; the
// message stays for Stash's log
export function grammarProblem(code, values, message) {
  return { code: code, values: values, message: message };
}

function refusal(code, values, message) {
  return Object.assign({ ok: false }, grammarProblem(code, values, message));
}

function titleCase(text) {
  return text.replace(/\S+/g, (word) => {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

// The value modifiers are all the same shape:
// any token, no value, one string in and one string out
// Splits "/find/replace/" into its two halves. Only "\/" is an escape this
// consumes: every other backslash belongs to the regex (\d, \w, \.) and has to
// survive intact. Returns null for anything that is not exactly two delimited
// halves, so a half-written value is reported rather than half-applied
function parseReplaceValue(raw) {
  const text = String(raw == null ? "" : raw);
  if (text.charAt(0) !== "/") {
    return null;
  }
  const parts = ["", ""];
  let stage = 0;
  for (let i = 1; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === "\\" && text.charAt(i + 1) === "/") {
      parts[stage] += "/";
      i++;
      continue;
    }
    if (ch === "\\") {
      parts[stage] += ch + text.charAt(i + 1);
      i++;
      continue;
    }
    if (ch === "/") {
      if (stage === 1) {
        return i === text.length - 1
          ? { find: parts[0], replace: parts[1] }
          : null;
      }
      stage = 1;
      continue;
    }
    parts[stage] += ch;
  }
  return null;
}

function valueModifier(applyValue, group, summary, example) {
  return {
    input: "value",
    appliesTo: ["*"],
    takesValue: "none",
    group: group || null,
    summary: summary,
    example: example,
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
//   repeatable true when writing it twice means something. Each copy runs in
//              its place in the chain, so two regexes are two replacements
//   group      a MODIFIER_GROUPS key when the modifier excludes its siblings
//   summary    one line of prose, and `example` a {pattern, before, after}
//              triple. Both are documentation rather than behaviour, but they
//              live here so that adding a modifier and documenting it are the
//              same edit: token-docs.js turns them into the in-app reference
//              and the README's table, and doc-coverage.test.js fails if they
//              are missing
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
    summary: "Joins at most the first N values",
    example: {
      pattern: "{performers|limit=2}",
      before: "Ava Kensington, Marcus Chen, Joy Adeyemi",
      after: "Ava Kensington, Marcus Chen",
    },
    // users pick these tokens by name, not by entity kind, so the "wrong token"
    // message enumerates the list tokens instead of saying "performer/tag"
    targetsAllLists: true,
    // a limit on a token that has no list is a provable no-op rather than a
    // wrong filename, so unlike every other modifier mistake it does not block
    misuseBlocks: false,
    parseValue: function (raw) {
      const text = String(raw == null ? "" : raw).trim();
      if (!/^\d+$/.test(text)) {
        return refusal(
          "limit_not_number",
          { example: "{performers|limit=2}" },
          "limit needs a whole number, as in {performers|limit=2}",
        );
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
    summary:
      "Keeps only performers of the gender(s) named, comma-separated. One or more of female, male, trans_female, trans_male, intersex, non_binary, unknown",
    example: {
      pattern: "{performers|gender=female}",
      before: "Ava Kensington, Marcus Chen",
      after: "Ava Kensington",
    },
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
        const genders = invalid
          .map((v) => {
            return '"' + v + '"';
          })
          .join(", ");
        const valid = GENDER_VALUES.join(", ");
        return refusal(
          "unknown_gender",
          { count: invalid.length, genders: genders, valid: valid },
          (invalid.length === 1
            ? "there is no gender "
            : "there are no genders ") +
            genders +
            ". Use one or more of: " +
            valid,
        );
      }
      if (wanted.length === 0) {
        return refusal("no_gender", {}, "gender= needs at least one gender");
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
  disambiguate: {
    input: "list",
    appliesTo: ["performer"],
    takesValue: "none",
    summary:
      "Appends a performer's disambiguation, in parentheses, when they have one. Stash lets two performers share a name only if their disambiguations differ, so this is what tells them apart",
    example: {
      pattern: "{performers|disambiguate}",
      before: "Alex, Marcus Chen",
      after: "Alex (Blonde), Marcus Chen",
    },
    // A performer with no disambiguation renders exactly as before: the point
    // is to separate the performers Stash could not, not to decorate the rest
    applyList: function (pairs) {
      return pairs.map((pair) => {
        const suffix = String(pair.entity.disambiguation || "").trim();
        return {
          entity: pair.entity,
          name: suffix ? pair.name + " (" + suffix + ")" : pair.name,
        };
      });
    },
  },
  uppercase: valueModifier(
    function (text) {
      return text.toUpperCase();
    },
    "case",
    "Upper-cases the value",
    {
      pattern: "{title|uppercase}",
      before: "Sunflower Fields",
      after: "SUNFLOWER FIELDS",
    },
  ),
  lowercase: valueModifier(
    function (text) {
      return text.toLowerCase();
    },
    "case",
    "Lower-cases the value",
    {
      pattern: "{title|lowercase}",
      before: "Sunflower Fields",
      after: "sunflower fields",
    },
  ),
  titlecase: valueModifier(
    titleCase,
    "case",
    "Capitalises the first letter of each word and lower-cases the rest. Meant for scraped ALL-CAPS titles, not for names: it turns McDonald into Mcdonald",
    {
      pattern: "{title|titlecase}",
      before: "SUNFLOWER FIELDS",
      after: "Sunflower Fields",
    },
  ),
  compact: valueModifier(
    function (text) {
      return text.replace(/\s+/g, "");
    },
    null,
    "Removes the spaces from the value",
    {
      pattern: "{title|compact}",
      before: "Sunflower Fields",
      after: "SunflowerFields",
    },
  ),
  regex: {
    input: "value",
    appliesTo: ["*"],
    takesValue: "required",
    repeatable: true,
    summary:
      "Find-and-replace, written /find/replace/. Reuses captured groups as $1, $2. Write \\/ for a literal slash. Repeat it for several replacements, applied left to right",
    example: {
      pattern: "{title|regex=/(?:\\D*(\\d+).*)/Time for $1/}",
      before: "Happy 420 day",
      after: "Time for 420",
    },
    parseValue: function (raw) {
      const parsed = parseReplaceValue(raw);
      if (!parsed) {
        return refusal(
          "regex_shape",
          { example: "{title|regex=/ - Trailer//}" },
          "regex= is written as /find/replace/, as in" +
            " {title|regex=/ - Trailer//}. Write \\/ for a literal slash",
        );
      }
      if (parsed.find === "") {
        return refusal("regex_empty", {}, "regex= has nothing to search for");
      }
      // Safety: ensure that regex differences between browser and Goja
      // are refused, but offer alternatives so the user can make progress
      if (/\\[pP]\{/.test(parsed.find)) {
        return refusal(
          "regex_unicode_class",
          { construct: "\\p{...}" },
          "\\p{...} matches in the preview but not when renaming." +
            " Use a class like [A-Za-z] instead",
        );
      }
      if (parsed.find.indexOf("[[:") !== -1) {
        return refusal(
          "regex_posix_class",
          { construct: "[[:digit:]]" },
          "POSIX classes like [[:digit:]] match when renaming but not in the" +
            " preview. Use \\d, \\w or a class like [0-9] instead",
        );
      }
      if (parsed.replace.indexOf("$<") !== -1) {
        return refusal(
          "regex_named_group",
          { construct: "$<name>" },
          "renaming can't use $<name> in a replacement. Use the group's" +
            " number instead, as in $1",
        );
      }
      const backref = /\\(\d)/.exec(parsed.replace);
      if (backref) {
        return refusal(
          "regex_backslash_group",
          { n: backref[1] },
          "write $" + backref[1] + " rather than \\" + backref[1],
        );
      }
      let compiled;
      try {
        compiled = new RegExp(parsed.find, "g");
      } catch (e) {
        return refusal(
          "regex_invalid",
          { find: parsed.find },
          '"' + parsed.find + '" is not a valid regular expression',
        );
      }
      // Big difference between Goja and browser here, they disagree about
      // how zero-or-one '?' matches so running /\d?/X/ on "abc-123" becomes
      // "abc-XXX" in the browser but "aXbXcX-XXXX" in Goja
      if (compiled.test("")) {
        return refusal(
          "regex_matches_empty",
          { find: parsed.find },
          '"' +
            parsed.find +
            '" can match nothing at all, which puts the replacement between' +
            " every character. Use + rather than *",
        );
      }
      return { ok: true, value: parsed };
    },
    applyValue: function (text, raw) {
      const parsed = MODIFIERS.regex.parseValue(raw);
      if (!parsed.ok) {
        return text;
      }
      return text.replace(
        new RegExp(parsed.value.find, "g"),
        parsed.value.replace,
      );
    },
  },
  from: {
    input: "source",
    appliesTo: ["stash_id", "custom_field"],
    takesValue: "required",
    summary:
      "Which source the value comes from. On {stash_id}, a stash-box by name or endpoint URL, defaulting to the rule's default source. On {@Field}, write studio to read the {noun}'s studio's custom field instead of its own",
    example: {
      pattern: "{stash_id|from=StashDB}",
      before: "IDs from two stash-boxes",
      after: "the StashDB one",
    },
    // Only the shape can be checked here: whether a name/source actually
    // exists is a question findPatternProblems answers, since it is the only
    // place that both knows the token this "from" belongs to and, for
    // stash_id, has the configured stash-boxes to check against
    parseValue: function (raw) {
      const text = String(raw == null ? "" : raw).trim();
      if (!text) {
        return refusal(
          "from_empty",
          { example: "{stash_id|from=StashDB}" },
          "from= needs a stash-box name, like {stash_id|from=StashDB}",
        );
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

// modifierValue cannot answer this for a modifier that takes no value: its
// value is null whether it was written or not
export function hasModifier(parsed, name) {
  return (
    ((parsed && parsed.modifiers) || []).filter((m) => {
      return m.name === name;
    }).length > 0
  );
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

// Splits a token body on "|", treating a /.../.../ modifier value as one opaque
// span so that a regex may contain the separator: {title|regex=/(a|b)/X/} is one
// modifier, not three. A value is entered at "=/" and left at its third
// unescaped "/", which is also why the trailing "?" of an optional token is
// never ambiguous -- the value always ends with a "/"
export function splitModifierChunks(text) {
  const chunks = [];
  let current = "";
  let inValue = false;
  let closers = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (inValue) {
      if (ch === "\\" && i + 1 < text.length) {
        current += ch + text.charAt(i + 1);
        i++;
        continue;
      }
      if (ch === "/") {
        closers++;
        if (closers === 2) {
          inValue = false;
        }
      }
      current += ch;
      continue;
    }
    if (ch === "|") {
      chunks.push(current);
      current = "";
      continue;
    }
    current += ch;
    if (ch === "/" && text.charAt(i - 1) === "=") {
      inValue = true;
      closers = 0;
    }
  }
  chunks.push(current);
  return chunks;
}

export function parseToken(name, body, index, raw, arg) {
  const token = {
    name: name,
    raw: raw,
    index: index,
    optional: false,
    arg: arg === undefined ? null : arg,
    modifiers: [],
    errors: [],
  };

  if (token.arg === "") {
    token.errors.push(
      grammarProblem(
        "no_custom_field_name",
        { token: "{@...}", example: "{@Series}" },
        "{@...} needs a custom field name, as in {@Series}",
      ),
    );
  }

  let text = body || "";
  if (text.charAt(text.length - 1) === "?") {
    token.optional = true;
    text = text.slice(0, -1);
  }

  const chunks = splitModifierChunks(text);
  const head = chunks.shift();
  if (head !== "") {
    const limitMatch = /^:(\d+)$/.exec(head);
    if (limitMatch) {
      if (chunks.length > 0) {
        // ":N" is pinned to the front of the token, so as soon as anything
        // else is present its position stops matching its meaning: it reads
        // like a cap on the final list but runs before every filter. Rather
        // than let {performers:1|gender=female} quietly mean "the first
        // performer, if she is female", refuse it and name the spelling that
        // says what it does
        const example =
          "{" + name + "|limit=" + limitMatch[1] + "|" + chunks.join("|") + "}";
        token.errors.push(
          grammarProblem(
            "shorthand_not_alone",
            { shorthand: ":" + limitMatch[1], example: example },
            ":" +
              limitMatch[1] +
              " only works on its own, since it always runs before the other" +
              " modifiers. Write " +
              example +
              " instead",
          ),
        );
      } else {
        // desugared rather than kept as its own field: with nothing else on the
        // token there is no order for it to disagree with
        token.modifiers.push({
          name: "limit",
          value: limitMatch[1],
          raw: head,
        });
      }
    } else if (head.indexOf("?") !== -1) {
      const example = "{" + name + "|...?}";
      token.errors.push(
        grammarProblem(
          "optional_not_last",
          { example: example },
          "the ? has to come last, as in " + example,
        ),
      );
    } else {
      const text = head.replace(/^:/, "");
      const example = "{" + name + "|name=value}";
      token.errors.push(
        grammarProblem(
          "unknown_head",
          { text: text, example: example },
          '"' + text + "\" isn't a modifier. Write modifiers as " + example,
        ),
      );
    }
  }

  chunks.forEach((chunk) => {
    if (chunk === "") {
      token.errors.push(
        grammarProblem(
          "empty_modifier",
          {},
          "there is an empty modifier between two | separators",
        ),
      );
      return;
    }
    const eq = chunk.indexOf("=");
    const key = eq === -1 ? chunk : chunk.slice(0, eq);
    if (!/^\w+$/.test(key)) {
      token.errors.push(
        grammarProblem(
          "invalid_modifier",
          { chunk: chunk },
          '"' + chunk + '" is not a valid modifier',
        ),
      );
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

// Index of the "}" that closes the token opened at `open`, or -1.
// `opaque` skips over a /.../.../ modifier value so that the braces of a {2}
// quantifier inside a regex are not mistaken for the end of the token, or for a
// nested token. A "{" outside such a value still ends the search, keeping the
// no-nested-tokens promise
function findTokenEnd(text, bodyStart, opaque) {
  let inValue = false;
  let closers = 0;
  for (let i = bodyStart; i < text.length; i++) {
    const ch = text.charAt(i);
    if (inValue) {
      if (ch === "\\") {
        i++;
      } else if (ch === "/") {
        closers++;
        if (closers === 2) {
          inValue = false;
        }
      }
      continue;
    }
    if (ch === "}") {
      return i;
    }
    if (ch === "{") {
      return -1;
    }
    if (opaque && ch === "/" && text.charAt(i - 1) === "=") {
      inValue = true;
      closers = 0;
    }
  }
  return -1;
}

export function scanPattern(pattern) {
  const text = pattern || "";
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("{", i);
    if (open === -1) {
      break;
    }
    const rest = text.slice(open);
    const customMatch = CUSTOM_TOKEN_START.exec(rest);
    const nameMatch = customMatch || TOKEN_START.exec(rest);
    if (!nameMatch) {
      i = open + 1;
      continue;
    }
    const bodyStart = open + nameMatch[0].length;
    // an unterminated value must not swallow the rest of the pattern, so a
    // failed opaque scan falls back to the plain "first }" rule
    let end = findTokenEnd(text, bodyStart, true);
    if (end === -1) {
      end = findTokenEnd(text, bodyStart, false);
    }
    if (end === -1) {
      i = open + 1;
      continue;
    }
    tokens.push(
      parseToken(
        customMatch ? CUSTOM_FIELD_TOKEN : nameMatch[1],
        text.slice(bodyStart, end),
        open,
        text.slice(open, end + 1),
        customMatch ? nameMatch[1].replace(/^\s+|\s+$/g, "") : undefined,
      ),
    );
    i = end + 1;
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
      // An item a rewrite empties is dropped, so it neither leaves a stray
      // delimiter behind nor takes a place a later limit= would count
      result = result
        .map((pair) => {
          return {
            entity: pair.entity,
            name: spec.applyValue(pair.name, modifier.value),
          };
        })
        .filter((pair) => {
          return pair.name.trim() !== "";
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
      result = spec.applyValue(result, modifier.value);
    }
  });
  return result;
}
