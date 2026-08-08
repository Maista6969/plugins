import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "src",
);

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return /\.(js|ts|tsx)$/.test(e.name) ? [full] : [];
  });
}

// A "//" inside a GraphQL document is not a comment, it is a syntax error that
// only surfaces when the query is parsed at runtime: the build is perfectly
// happy with it. GraphQL comments start with "#".
test("no JavaScript comments inside GraphQL template literals", () => {
  const offenders = [];
  for (const file of sourceFiles(SRC)) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/`([^`]*)`/g)) {
      const body = match[1];
      // only consider templates that actually look like GraphQL
      if (!/\b(query|mutation|fragment)\b|\{\s*\n?\s*(id|count)\b/.test(body)) {
        continue;
      }
      const line = body.split("\n").find((l) => /^\s*\/\//.test(l));
      if (line) {
        offenders.push(path.relative(SRC, file) + ": " + line.trim());
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "GraphQL documents must use # for comments, not //:\n" +
      offenders.join("\n"),
  );
});
