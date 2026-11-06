// Stash evaluates regex conditions with Go's RE2, so a rule has to read them
// the same way or its conditions fail on entities Stash's filter selected.
// RE2's flag groups, (?i) (?m) (?s) (?U) with their (?flags:re) and (?-flags)
// forms, are rewritten into plain syntax because JavaScript's flags only cover
// a whole pattern and the Goja VM has no scoped modifiers. So is the RE2
// syntax JavaScript would otherwise misread without complaint: POSIX classes,
// \x{41}, \Q...\E and the ASCII-only \s.
// Stays compatible with the Goja VM, like the rest of core

const FLAG_GROUP = /^\(\?([imsU]*)(?:-([imsU]*))?([:)])/;
const QUANTIFIER = /^(?:[*+?]|\{\d+(?:,\d*)?\})/;

const POSIX_CLASSES = {
  alnum: [
    [48, 57],
    [65, 90],
    [97, 122],
  ],
  alpha: [
    [65, 90],
    [97, 122],
  ],
  ascii: [[0, 127]],
  blank: [
    [9, 9],
    [32, 32],
  ],
  cntrl: [
    [0, 31],
    [127, 127],
  ],
  digit: [[48, 57]],
  graph: [[33, 126]],
  lower: [[97, 122]],
  print: [[32, 126]],
  punct: [
    [33, 47],
    [58, 64],
    [91, 96],
    [123, 126],
  ],
  space: [
    [9, 13],
    [32, 32],
  ],
  upper: [[65, 90]],
  word: [
    [48, 57],
    [65, 90],
    [95, 95],
    [97, 122],
  ],
  xdigit: [
    [48, 57],
    [65, 70],
    [97, 102],
  ],
};

// RE2's \s is [\t\n\f\r ]; JavaScript's also takes \v and Unicode spaces
const SPACE = "\\t\\n\\f\\r ";

const CONTROL_ESCAPES = { a: 7, t: 9, n: 10, v: 11, f: 12, r: 13 };

const cache = {};

// Throws like the RegExp constructor when the pattern can't be read
export function goRegExp(source) {
  if (!Object.prototype.hasOwnProperty.call(cache, source)) {
    cache[source] = new RegExp(translateGoRegExp(source));
  }
  return cache[source];
}

function withFlags(flags, set, clear) {
  const next = Object.assign({}, flags);
  (set || "").split("").forEach((f) => {
    next[f] = true;
  });
  (clear || "").split("").forEach((f) => {
    next[f] = false;
  });
  return next;
}

// shortcut: built from JavaScript's case mappings, so the few letters RE2
// folds without one (the Kelvin sign for k, long s for s) are missed; add a
// table if anyone writes (?i) expecting those
function otherCases(c) {
  const found = [];
  [
    c.toLowerCase(),
    c.toUpperCase(),
    c.toUpperCase().toLowerCase(),
    c.toLowerCase().toUpperCase(),
  ].forEach((other) => {
    if (other.length === 1 && other !== c && found.indexOf(other) === -1) {
      found.push(other);
    }
  });
  return found;
}

function escapeOutside(c) {
  return /[\\^$.*+?()[\]{}|/]/.test(c) ? "\\" + c : c;
}

function escapeInside(c) {
  return /[\\\]^-]/.test(c) ? "\\" + c : c;
}

function codePointText(code) {
  return String.fromCodePoint(code);
}

function literal(text, caseless) {
  if (text.length !== 1) {
    return "(?:" + text.split("").map(escapeOutside).join("") + ")";
  }
  const others = caseless ? otherCases(text) : [];
  return others.length
    ? "[" + [text].concat(others).map(escapeInside).join("") + "]"
    : escapeOutside(text);
}

function rangeText(from, to) {
  const start = escapeInside(codePointText(from));
  return from === to ? start : start + "-" + escapeInside(codePointText(to));
}

// Everything up to the end of the BMP outside the ranges, which are sorted.
// An astral character still lands in it through its surrogates
function complement(ranges) {
  const out = [];
  let from = 0;
  ranges.forEach((range) => {
    if (range[0] > from) {
      out.push([from, range[0] - 1]);
    }
    from = range[1] + 1;
  });
  out.push([from, 0xffff]);
  return out;
}

// Collapses runs of consecutive code points into ranges
function classRanges(codes) {
  const sorted = codes.slice().sort((a, b) => a - b);
  let out = "";
  let k = 0;
  while (k < sorted.length) {
    let end = k;
    while (end + 1 < sorted.length && sorted[end + 1] <= sorted[end] + 1) {
      end++;
    }
    out += rangeText(sorted[k], sorted[end]);
    k = end + 1;
  }
  return out;
}

// One escape, as {code} when it stands for a single character, else as
// {text} already in JavaScript syntax
function readEscape(source, i, inClass) {
  const next = source[i + 1];
  if (next === undefined) {
    throw new SyntaxError("trailing backslash");
  }
  const hex = /^\\x(?:\{([0-9A-Fa-f]+)\}|([0-9A-Fa-f]{2}))/.exec(
    source.slice(i),
  );
  if (hex) {
    return { code: parseInt(hex[1] || hex[2], 16), end: i + hex[0].length };
  }
  if (Object.prototype.hasOwnProperty.call(CONTROL_ESCAPES, next)) {
    return { code: CONTROL_ESCAPES[next], end: i + 2 };
  }
  // Goja has no Unicode property escapes, so the backend couldn't match
  // what the browser previews
  if (next === "p" || next === "P") {
    throw new SyntaxError("Unicode classes are not supported");
  }
  if (next === "s") {
    return { text: inClass ? SPACE : "[" + SPACE + "]", end: i + 2 };
  }
  if (next === "S" && !inClass) {
    return { text: "[^" + SPACE + "]", end: i + 2 };
  }
  if (/[!-/:-@[-`{-~]/.test(next)) {
    return { code: next.charCodeAt(0), end: i + 2 };
  }
  return { text: source.slice(i, i + 2), end: i + 2 };
}

// A character class runs to its first unescaped "]", except one written
// straight after the opening "[" or "[^", which RE2 reads as a literal.
// Under (?i) the other case of every letter it lists is appended, which also
// keeps a negated class excluding both cases
function translateClass(source, i, caseless) {
  let k = i + 1;
  let out = "[";
  if (source[k] === "^") {
    out += "^";
    k++;
  }
  const folded = [];
  const addCodes = (from, to) => {
    if (!caseless) {
      return;
    }
    // shortcut: astral letters keep one case, upgrade if (?i) meets them
    for (let code = from; code <= to && code <= 0xffff; code++) {
      otherCases(String.fromCharCode(code)).forEach((other) => {
        folded.push(other.charCodeAt(0));
      });
    }
  };
  const readAtom = () => {
    if (source[k] === "\\") {
      const escape = readEscape(source, k, true);
      k = escape.end;
      return escape;
    }
    const code = source.codePointAt(k);
    k += code > 0xffff ? 2 : 1;
    return { code: code };
  };
  let first = true;
  while (k < source.length && (source[k] !== "]" || first)) {
    first = false;
    const posix = /^\[:(\^?)([a-z]+):\]/.exec(source.slice(k));
    if (posix) {
      const listed = POSIX_CLASSES[posix[2]];
      if (!listed) {
        throw new SyntaxError("unknown class [:" + posix[2] + ":]");
      }
      const ranges = posix[1] ? complement(listed) : listed;
      ranges.forEach((range) => {
        out += rangeText(range[0], range[1]);
        addCodes(range[0], range[1]);
      });
      k += posix[0].length;
      continue;
    }
    const atom = readAtom();
    if (atom.text !== undefined) {
      out += atom.text;
      continue;
    }
    if (source[k] === "-" && k + 1 < source.length && source[k + 1] !== "]") {
      k++;
      const end = readAtom();
      if (end.code === undefined) {
        throw new SyntaxError("invalid class range");
      }
      out += rangeText(atom.code, end.code);
      addCodes(atom.code, end.code);
      continue;
    }
    out += escapeInside(codePointText(atom.code));
    addCodes(atom.code, atom.code);
  }
  if (k >= source.length) {
    throw new SyntaxError("missing closing ]");
  }
  return { text: out + classRanges(folded) + "]", end: k + 1 };
}

export function translateGoRegExp(source) {
  let flags = { i: false, m: false, s: false, U: false };
  const stack = [];
  let out = "";
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const rest = source.slice(i);
    if (rest.slice(0, 2) === "\\Q") {
      const close = source.indexOf("\\E", i + 2);
      const end = close === -1 ? source.length : close;
      for (let k = i + 2; k < end; k++) {
        out += literal(source[k], flags.i);
      }
      i = close === -1 ? end : end + 2;
    } else if (rest.slice(0, 2) === "\\A") {
      out += "^";
      i += 2;
    } else if (rest.slice(0, 2) === "\\z") {
      out += "$";
      i += 2;
    } else if (c === "\\") {
      const escape = readEscape(source, i, false);
      out +=
        escape.text !== undefined
          ? escape.text
          : literal(codePointText(escape.code), flags.i);
      i = escape.end;
    } else if (c === "[") {
      const cls = translateClass(source, i, flags.i);
      out += cls.text;
      i = cls.end;
    } else if (FLAG_GROUP.test(rest)) {
      const group = FLAG_GROUP.exec(rest);
      const next = withFlags(flags, group[1], group[2]);
      if (group[3] === ")") {
        flags = next;
      } else {
        stack.push(flags);
        flags = next;
        out += "(?:";
      }
      i += group[0].length;
    } else if (c === "(") {
      // Group names are dropped: only whether the pattern matches matters here
      const named = /^\(\?P?<[^>]*>/.exec(rest);
      stack.push(flags);
      out += "(";
      i += named ? named[0].length : 1;
    } else if (c === ")") {
      flags = stack.length ? stack.pop() : flags;
      out += ")";
      i++;
    } else if (c === ".") {
      // RE2's dot excludes only "\n", JavaScript's also "\r" and U+2028-9
      out += flags.s ? "[\\s\\S]" : "[^\\n]";
      i++;
    } else if (c === "^") {
      out += flags.m ? "(?:^|(?<=\\n))" : "^";
      i++;
    } else if (c === "$") {
      out += flags.m ? "(?:$|(?=\\n))" : "$";
      i++;
    } else if (QUANTIFIER.test(rest)) {
      const quantifier = QUANTIFIER.exec(rest)[0];
      const lazy = source[i + quantifier.length] === "?";
      out += quantifier + (lazy !== flags.U ? "?" : "");
      i += quantifier.length + (lazy ? 1 : 0);
    } else if (c === "|") {
      out += c;
      i++;
    } else {
      const code = source.codePointAt(i);
      out += literal(codePointText(code), flags.i);
      i += code > 0xffff ? 2 : 1;
    }
  }
  return out;
}
