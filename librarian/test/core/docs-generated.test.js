import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { render, README_PATH } from "../../scripts/generate-docs.mjs";

// Adding a modifier updates the in-app reference for free, because that reads
// the registry at runtime. The README does not: it holds a snapshot, so this is
// what turns "someone forgot to run npm run docs" from a silently stale table
// into a failing test
test("README generated tables match the registries", () => {
  const source = fs.readFileSync(README_PATH, "utf8");
  assert.equal(
    render(source),
    source,
    "README.md is out of date with the token/modifier registries. Run `npm run docs` and commit the result",
  );
});

test("every generated region is present in the README", () => {
  const source = fs.readFileSync(README_PATH, "utf8");
  ["modifiers", "modifier-examples", "tokens-metadata", "tokens-file"].forEach(
    (name) => {
      assert.ok(
        source.indexOf("<!-- BEGIN GENERATED: " + name + " -->") !== -1,
        "missing BEGIN marker for " + name,
      );
      assert.ok(
        source.indexOf("<!-- END GENERATED: " + name + " -->") !== -1,
        "missing END marker for " + name,
      );
    },
  );
});

// the generator throws rather than silently skipping a region it cannot find,
// so a marker deleted by accident is loud
test("a missing region is an error, not a silent skip", () => {
  const source = fs.readFileSync(README_PATH, "utf8");
  const broken = source.replace("<!-- BEGIN GENERATED: modifiers -->", "");
  assert.throws(() => render(broken), /missing generated regions: modifiers/);
});
