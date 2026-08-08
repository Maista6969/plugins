// The token grammar, in one place.
//
//   { name ( ":" digits )? ( "|" modifier )* "?"? }
//   modifier := key ( "=" value )?
//
// e.g. {title}  {performers:2}  {title?}  {performers:2?}
//
// ":N" is the original spelling of the limit and stays supported; "?" is still
// always the last character before the closing brace.
//
// Deliberately parsed in two stages rather than by one big regex: a modifier
// value can legitimately contain ":", "|" and "?", which a monolithic pattern
// cannot disambiguate

// Looser than the grammar on purpose, so that "{foo bar}" is *seen* and can be
// reported as malformed instead of being silently invisible. Callers must
// render tokens carrying errors literally, exactly as unknown tokens render
export const TOKEN_SCAN = /\{(\w+)([^{}]*)\}/;

// Modifiers, keyed by name.
//   stage      "entity" filters the underlying list, "text" rewrites the
//              rendered string. Application order is fixed by stage, never by
//              the order they were written: otherwise
//              {performers|limit=1|something} would quietly mean something
//              different from {performers|something|limit=1}
//   appliesTo  entity kinds the modifier is meaningful for ("*" for any), which
//              is what makes a modifier on the wrong token an error, not a no-op
//   parseValue turns the written value into whatever apply wants, or explains
//              why it can't. Its message is the only documentation most users
//              will ever see for the valid values
export const MODIFIERS = {};

// "limit" belongs to the grammar rather than the registry: it is the named
// spelling of the original ":N", and is folded into token.limit while parsing
export const GRAMMAR_MODIFIER_NAMES = ["limit"];

export function knownModifierNames() {
  return Object.keys(MODIFIERS).concat(GRAMMAR_MODIFIER_NAMES).sort();
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
    limit: null,
    modifiers: [],
    errors: [],
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
      token.limit = parseInt(limitMatch[1], 10);
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
          '" means here: a limit is written as {' +
          name +
          ":2} and a modifier as {" +
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
    const value = eq === -1 ? null : chunk.slice(eq + 1);

    // limit is grammar, not a registry modifier: fold it into token.limit so
    // {performers|limit=2} and {performers:2} are the same thing downstream
    if (key === "limit") {
      if (value == null || !/^\d+$/.test(value)) {
        token.errors.push(
          "limit needs a whole number, as in {" + name + "|limit=2}",
        );
      } else if (token.limit != null) {
        token.errors.push(
          "this token sets a limit twice, once as :" +
            token.limit +
            " and once as limit=" +
            value,
        );
      } else {
        token.limit = parseInt(value, 10);
      }
      return;
    }

    token.modifiers.push({ name: key, value: value, raw: chunk });
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

export function applyEntityModifiers(entities, parsed) {
  let result = entities;
  (parsed.modifiers || []).forEach((modifier) => {
    const spec = MODIFIERS[modifier.name];
    if (spec && spec.stage === "entity") {
      result = spec.apply(result, modifier.value);
    }
  });
  return result;
}

export function applyTextModifiers(text, parsed) {
  let result = text;
  (parsed.modifiers || []).forEach((modifier) => {
    const spec = MODIFIERS[modifier.name];
    if (spec && spec.stage === "text") {
      result = spec.apply(result, modifier.value);
    }
  });
  return result;
}
