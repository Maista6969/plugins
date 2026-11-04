import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateCondition,
  describeCondition,
} from "../../src/core/rule-engine.js";
import { ruleToSceneFilter } from "../../src/core/rule-to-filter.js";
import { normalizeScene } from "../../src/core/normalize-scene.js";
import { normalizeConfig } from "../../src/core/config-schema.js";
import { textWordSplit } from "../../src/core/rule-lint.js";

const titled = (title) => {
  return normalizeScene({ id: "s", title: title });
};
const title = (op, value) => {
  return { field: "title", op: op, value: value };
};
const withCodecs = (codecs) => {
  return normalizeScene({
    id: "s",
    files: codecs.map((codec, i) => {
      return { id: String(i), path: "/a/" + i + ".mp4", video_codec: codec };
    }),
  });
};
const codec = (op, value) => {
  return { field: "video_codec", op: op, value: value };
};

test("title compares the way Stash's title filter does", () => {
  const scene = titled("Anita Goes Hard");
  assert.equal(evaluateCondition(scene, title("INCLUDES", "anita")), true);
  assert.equal(evaluateCondition(scene, title("INCLUDES", "trailer")), false);
  assert.equal(evaluateCondition(scene, title("EXCLUDES", "trailer")), true);
  assert.equal(
    evaluateCondition(scene, title("EQUALS", "anita goes hard")),
    true,
  );
  assert.equal(evaluateCondition(scene, title("NOT_EQUALS", "Anita")), true);
  assert.equal(
    evaluateCondition(scene, title("MATCHES_REGEX", "^Anita")),
    true,
  );
  assert.equal(evaluateCondition(scene, title("NOT_NULL", "")), true);
  assert.equal(evaluateCondition(scene, title("IS_NULL", "")), false);
});

test("an untitled item is NULL to Stash, so only the negative regex and is not set match it", () => {
  const scene = titled("");
  assert.equal(evaluateCondition(scene, title("IS_NULL", "")), true);
  assert.equal(evaluateCondition(scene, title("NOT_NULL", "")), false);
  assert.equal(evaluateCondition(scene, title("EXCLUDES", "x")), false);
  assert.equal(evaluateCondition(scene, title("NOT_EQUALS", "x")), false);
  assert.equal(evaluateCondition(scene, title("NOT_MATCHES_REGEX", "x")), true);
  assert.equal(evaluateCondition(scene, title("MATCHES_REGEX", ".*")), false);
  // Stash trims for the presence checks only
  assert.equal(evaluateCondition(titled("  "), title("IS_NULL", "")), true);
});

test("title translates to Stash's title filter, and says what it asked", () => {
  assert.deepEqual(
    ruleToSceneFilter({ conditions: [title("EXCLUDES", "Trailer")] }),
    {
      title: { value: "Trailer", modifier: "EXCLUDES" },
    },
  );
  assert.deepEqual(ruleToSceneFilter({ conditions: [title("IS_NULL", "")] }), {
    title: { value: "", modifier: "IS_NULL" },
  });
  assert.equal(
    ruleToSceneFilter({ conditions: [title("INCLUDES", "")] }),
    null,
  );
  assert.equal(
    describeCondition(titled("x"), title("INCLUDES", "Trailer")),
    "title contains 'Trailer'",
  );
  assert.equal(
    describeCondition(titled(""), title("IS_NULL", "")),
    "title is not set",
  );
});

test("an unquoted multi-word title search warns that it matches any one word", () => {
  assert.deepEqual(textWordSplit(title("INCLUDES", "Behind the Scenes")), [
    "Behind",
    "the",
    "Scenes",
  ]);
  assert.equal(textWordSplit(title("INCLUDES", '"Behind the Scenes"')), null);
});

test("video codec matches when any of a scene's files has it", () => {
  const scene = withCodecs(["h264", "av1"]);
  assert.equal(evaluateCondition(scene, codec("EQUALS", "AV1")), true);
  assert.equal(evaluateCondition(scene, codec("INCLUDES", "hevc")), false);
  assert.equal(
    evaluateCondition(withCodecs(["av1"]), codec("NOT_EQUALS", "av1")),
    false,
  );
  assert.deepEqual(
    ruleToSceneFilter({ conditions: [codec("EQUALS", "av1")] }),
    {
      video_codec: { value: "av1", modifier: "EQUALS" },
    },
  );
  assert.equal(
    describeCondition(scene, codec("EQUALS", "av1")),
    "video codec is 'av1'",
  );
});

test("video codec conditions are stripped from galleries and images", () => {
  const config = normalizeConfig({
    galleries: { rules: [{ id: "g", conditions: [codec("EQUALS", "av1")] }] },
    images: {
      rules: [
        {
          id: "i",
          conditions: [codec("EQUALS", "av1"), title("NOT_NULL", "")],
        },
      ],
    },
    scenes: { rules: [{ id: "s", conditions: [codec("EQUALS", "av1")] }] },
  });
  assert.deepEqual(config.galleries.rules[0].conditions, []);
  assert.deepEqual(config.images.rules[0].conditions, [title("NOT_NULL", "")]);
  assert.deepEqual(config.scenes.rules[0].conditions, [codec("EQUALS", "av1")]);
});
