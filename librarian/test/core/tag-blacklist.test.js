import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTokens,
  renderTemplate,
  findMissingRequiredData,
} from "../../src/core/path-template.js";
import { normalizeConfig } from "../../src/core/config-schema.js";
import { planScene } from "../../src/core/plan-scene.js";
import { multiRuleMatchScene } from "../fixtures/scenes.js";

function sceneView(overrides) {
  return Object.assign(
    {
      id: "1",
      title: "My Title",
      date: "2024-03-05",
      organized: true,
      studioNames: [],
      performerNames: [],
      performers: [],
      tagNames: ["Rock", "Pop"],
      tags: [
        { id: "t1", name: "Rock" },
        { id: "t2", name: "Pop" },
      ],
      files: [],
    },
    overrides,
  );
}

function render(pattern, view, configOverrides, matchedIds) {
  const config = normalizeConfig(configOverrides || {});
  const tokens = buildTokens(view, config, matchedIds || null);
  return renderTemplate(pattern, tokens);
}

test("a blacklisted tag is left out of {tags} but its sibling still renders", () => {
  const view = sceneView();
  assert.equal(render("{tags}", view), "Pop, Rock");
  assert.equal(render("{tags}", view, { tagBlacklist: ["t1"] }), "Pop");
});

test("blacklisting every tag renders {tags} empty rather than reporting missing data", () => {
  const view = sceneView();
  assert.equal(render("{tags}", view, { tagBlacklist: ["t1", "t2"] }), "");
  assert.deepEqual(
    findMissingRequiredData(["{tags}"], view),
    [],
    "a blacklist-emptied list is a filtered-empty case, the same as a gender filter matching nobody, not missing data",
  );
});

test("<...> collapses around {tags} the same way it does around a gender-filtered {performers}", () => {
  const view = sceneView();
  assert.equal(
    render("{title}< [{tags}]>", view, { tagBlacklist: ["t1", "t2"] }),
    "My Title",
  );
  assert.equal(
    render("{title}< [{tags}]>", view, { tagBlacklist: ["t1"] }),
    "My Title [Pop]",
  );
});

test("{matched_tags} drops a blacklisted tag even though it's the one that matched", () => {
  const view = sceneView();
  const matchedIds = {
    performerIds: [],
    tagIds: ["t1"],
    stashBoxEndpoint: "",
    stashBoxes: null,
  };
  assert.equal(
    render("{matched_tags}", view, {}, matchedIds),
    "Rock",
    "sanity check: unfiltered, the matched tag renders normally",
  );
  assert.equal(
    render("{matched_tags}", view, { tagBlacklist: ["t1"] }, matchedIds),
    "",
  );
});

test("a blacklisted tag still satisfies a rule's own tag condition (blacklist only touches token output)", () => {
  const config = normalizeConfig({
    scenes: {
      tagBlacklist: ["t1"], // Rock
      rules: [
        {
          id: "r1",
          enabled: true,
          conditions: [{ field: "tag", op: "any_of", value: ["t1"] }],
          libraryRoot: "/data",
          folderPattern: "{studio}",
          filenamePattern: "{title} [{tags}]",
        },
      ],
      defaultPattern: { libraryRoot: "/data" },
    },
  });
  const result = planScene(multiRuleMatchScene, config);
  assert.equal(result.status, "ok");
  // matched via the blacklisted tag (t1/Rock), so the rule still applies...
  assert.equal(result.reason, "rule:r1");
  // ...but the blacklisted tag itself does not show up in the rendered name
  assert.equal(result.files[0].basename, "Multi Rule Match [Pop].mp4");
});
