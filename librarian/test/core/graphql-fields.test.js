import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PERFORMER_FIELDS, TAG_FIELDS } from "../../src/core/gql-fields.js";

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

function graphqlTemplates(source) {
  return [...source.matchAll(/`([^`]*)`/g)]
    .map((match) => match[1])
    .filter((body) =>
      /\b(query|mutation|fragment)\b|\{\s*\n?\s*(id|count)\b/.test(body),
    );
}

test("no JavaScript comments inside GraphQL template literals", () => {
  const offenders = [];
  for (const file of sourceFiles(SRC)) {
    for (const body of graphqlTemplates(fs.readFileSync(file, "utf8"))) {
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

// The backend and the frontend used to spell these selections out separately, so
// a field added for one runtime could go missing in the other and the preview
// would quietly disagree with what the task actually did. Every "p." and "t."
// reference in normalize-scene.js is a performer/tag field, so the required set
// can be read straight out of the consumer instead of being restated here
function fieldsReadFrom(receiver) {
  const source = fs.readFileSync(
    path.join(SRC, "core", "normalize-scene.js"),
    "utf8",
  );
  const pattern = new RegExp("\\b" + receiver + "\\.(\\w+)", "g");
  return [...new Set([...source.matchAll(pattern)].map((m) => m[1]))];
}

test("the shared selections fetch every field normalize-scene reads", () => {
  for (const field of fieldsReadFrom("p")) {
    assert.ok(
      PERFORMER_FIELDS.split(/\s+/).includes(field),
      "normalize-scene reads performer." +
        field +
        " but PERFORMER_FIELDS does not fetch it",
    );
  }
  for (const field of fieldsReadFrom("t")) {
    assert.ok(
      TAG_FIELDS.split(/\s+/).includes(field),
      "normalize-scene reads tag." +
        field +
        " but TAG_FIELDS does not fetch it",
    );
  }
});

test("performer selections are only spelled out in gql-fields.js", () => {
  const INLINED = /performers\s*\{(?!\s*\$\{)/;
  const offenders = sourceFiles(SRC)
    .filter((file) => path.basename(file) !== "gql-fields.js")
    .filter((file) =>
      graphqlTemplates(fs.readFileSync(file, "utf8")).some((body) =>
        INLINED.test(body),
      ),
    )
    .map((file) => path.relative(SRC, file));
  assert.deepEqual(
    offenders,
    [],
    "these files inline a performer selection instead of interpolating " +
      "PERFORMER_FIELDS, which is how the backend and frontend drift apart:\n" +
      offenders.join("\n"),
  );
});
