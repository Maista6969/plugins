// Rewrites the generated tables in README.md from the token and modifier
// registries, so the reference cannot drift from the code.
//
// Run with `npm run docs`, or `npm run docs -- --check` to fail without writing,
// which is what CI should do.
//
// Only the regions between the BEGIN/END markers are touched. Everything else
// in the README is hand-written prose and stays that way.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describeModifiers, describeTokens } from "../src/core/token-docs.js";
import { KNOWN_TOKENS } from "../src/core/path-template.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const README = path.join(__dirname, "..", "README.md");

// "|" ends a cell, and every table below is full of {a|b} patterns
function cell(text) {
  return String(text).replace(/\|/g, "\\|");
}

function table(headers, rows) {
  const widths = headers.map((h, i) => {
    return Math.max(h.length, ...rows.map((r) => r[i].length));
  });
  const line = (cells) => {
    return (
      "| " +
      cells
        .map((c, i) => {
          return c.padEnd(widths[i]);
        })
        .join(" | ") +
      " |"
    );
  };
  return [
    line(headers),
    "| " +
      widths
        .map((w) => {
          return "-".repeat(w);
        })
        .join(" | ") +
      " |",
    ...rows.map(line),
  ].join("\n");
}

function modifierTable() {
  const rows = describeModifiers().map((m) => {
    return [
      "`" + cell(m.spelling) + "`",
      cell(m.targets),
      cell(m.summary),
      "`" + cell(m.example.pattern) + "`",
    ];
  });
  return table(["Modifier", "Works on", "Effect", "Example"], rows);
}

function exampleList() {
  return describeModifiers()
    .map((m) => {
      return (
        "- `" +
        m.example.pattern +
        "` - `" +
        m.example.before +
        "` becomes `" +
        m.example.after +
        "`"
      );
    })
    .join("\n");
}

function tokenTable(fileTech) {
  const rows = describeTokens(KNOWN_TOKENS, "scene")
    .filter((t) => {
      return !!t.fileTech === fileTech;
    })
    .map((t) => {
      return ["`" + cell(t.spelling) + "`", cell(t.description)];
    });
  return table(["Token", "Description"], rows);
}

const REGIONS = {
  modifiers: modifierTable,
  "modifier-examples": exampleList,
  "tokens-metadata": () => {
    return tokenTable(false);
  },
  "tokens-file": () => {
    return tokenTable(true);
  },
};

export const README_PATH = README;

export function render(source) {
  let out = source;
  const missing = [];
  Object.keys(REGIONS).forEach((name) => {
    const begin = "<!-- BEGIN GENERATED: " + name + " -->";
    const end = "<!-- END GENERATED: " + name + " -->";
    const pattern = new RegExp(
      begin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        "[\\s\\S]*?" +
        end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
    if (!pattern.test(out)) {
      missing.push(name);
      return;
    }
    out = out.replace(pattern, begin + "\n\n" + REGIONS[name]() + "\n\n" + end);
  });
  if (missing.length > 0) {
    throw new Error(
      "README.md is missing generated regions: " +
        missing.join(", ") +
        ". Add the BEGIN/END marker pair for each",
    );
  }
  return out;
}

// Only act when run as a command; importing this module (docs-generated.test.js
// does) must not rewrite anything
const runDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (runDirectly) {
  const check = process.argv.includes("--check");
  const source = fs.readFileSync(README, "utf8");
  const next = render(source);

  if (source === next) {
    console.log("README.md generated tables are up to date");
  } else if (check) {
    console.error(
      "README.md generated tables are stale. Run `npm run docs` and commit the result",
    );
    process.exit(1);
  } else {
    fs.writeFileSync(README, next);
    console.log("README.md generated tables rewritten");
  }
}
