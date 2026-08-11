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

const SCENE_ONLY_FIELDS = ["groups", "stash_ids"];

const SHARED_FRAGMENT_FILES = [
  "backend/gql.js",
  "frontend/shared/scene-query-fields.ts",
];

function templateBody(source, name) {
  const match = source.match(new RegExp("const " + name + " = `([^`]*)`"));
  return match ? match[1] : null;
}

function commonMetadataFields(file) {
  const source = fs.readFileSync(path.join(SRC, file), "utf8");
  const body = templateBody(source, "COMMON_METADATA_FIELDS");
  assert.ok(body, file + " no longer defines COMMON_METADATA_FIELDS");
  return body;
}

test("the gallery/image metadata fragment asks for no scene-only field", () => {
  for (const file of SHARED_FRAGMENT_FILES) {
    const body = commonMetadataFields(file);
    for (const field of SCENE_ONLY_FIELDS) {
      assert.ok(
        !new RegExp("\\b" + field + "\\s*\\{").test(body),
        file +
          " selects " +
          field +
          " in COMMON_METADATA_FIELDS, but only Scene has that field: every " +
          "gallery and image query would fail validation and return null",
      );
    }
  }
});

test("the two COMMON_METADATA_FIELDS stay identical", () => {
  const [backend, frontend] = SHARED_FRAGMENT_FILES.map(commonMetadataFields);
  assert.equal(
    backend,
    frontend,
    "the backend job and the frontend preview would fetch different fields, " +
      "so the preview could disagree with what the rename actually does",
  );
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
