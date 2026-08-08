import test from "node:test";
import assert from "node:assert/strict";
import { planScene } from "../../src/core/plan-scene.js";
import { normalizeConfig } from "../../src/core/config-schema.js";
import {
  normalOrganizedScene,
  multiFileScene,
  unorganizedScene,
  noStudioScene,
  deepStudioHierarchyScene,
  slashInTagScene,
  multiRuleMatchScene,
  noRuleMatchScene,
  tagMatchedButMissingStudioHierarchyScene,
  cjkEmojiScene,
  performerNamedInTitleScene,
} from "../fixtures/scenes.js";

function baseConfig(overrides) {
  const merged = Object.assign({}, overrides);
  merged.defaultPattern = Object.assign(
    { libraryRoot: "/data" },
    overrides && overrides.defaultPattern,
  );
  if (Array.isArray(merged.rules)) {
    merged.rules = merged.rules.map((rule) => {
      return rule.libraryRoot
        ? rule
        : Object.assign({}, rule, { libraryRoot: "/data" });
    });
  }
  return normalizeConfig(merged);
}

test("normal organized single-file scene renders via the default pattern", () => {
  const result = planScene(normalOrganizedScene, baseConfig());
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].folder, "/data/Parent Co/Leaf Studio");
  assert.equal(result.files.length, 1);
  assert.equal(
    result.files[0].basename,
    "Leaf Studio - 2024-05-10 - Normal Scene.mp4",
  );
  assert.equal(result.files[0].unchanged, false);
});

test("multi-file scene gets numbered suffixes in exactly the order Stash returns its files, not re-sorted by id", () => {
  const result = planScene(multiFileScene, baseConfig());
  assert.equal(result.status, "ok");
  const byId = Object.fromEntries(
    result.files.map((f) => [f.fileId, f.basename]),
  );
  assert.equal(byId["20"], "Leaf Studio - 2024-05-11 - Multi File Scene.mp4");
  assert.equal(
    byId["19"],
    "Leaf Studio - 2024-05-11 - Multi File Scene (2).mp4",
  );
});

test("unorganized scene is skipped when onlyOrganized is true", () => {
  const result = planScene(unorganizedScene, baseConfig());
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "not_organized");
  assert.deepEqual(result.files, []);
});

test("onlyOrganized can be disabled to include unorganized scenes", () => {
  const result = planScene(
    unorganizedScene,
    baseConfig({
      onlyOrganized: false,
      defaultPattern: { folderPattern: "{studio}", filenamePattern: "{title}" },
    }),
  );
  assert.equal(result.status, "ok");
});

test("onlyWithStashId skips a scene with no stash_ids when enabled", () => {
  const scene = Object.assign({}, normalOrganizedScene, { stash_ids: [] });
  const result = planScene(scene, baseConfig({ onlyWithStashId: true }));
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "no_stash_id");
  assert.deepEqual(result.files, []);
});

test("onlyWithStashId lets a scene with at least one stash_id through", () => {
  const scene = Object.assign({}, normalOrganizedScene, {
    stash_ids: [
      { endpoint: "https://stashdb.org/graphql", stash_id: "abc-123" },
    ],
  });
  const result = planScene(scene, baseConfig({ onlyWithStashId: true }));
  assert.equal(result.status, "ok");
});

test("onlyWithStashId is off by default, so a scene with no stash_ids still renames normally", () => {
  const result = planScene(normalOrganizedScene, baseConfig());
  assert.equal(result.status, "ok");
});

test("{stash_id} in the default pattern resolves against defaultPattern.stashBoxEndpoint", () => {
  const scene = Object.assign({}, normalOrganizedScene, {
    stash_ids: [
      { endpoint: "https://stashdb.org/graphql", stash_id: "aaa-111" },
      { endpoint: "https://theporndb.net/graphql", stash_id: "bbb-222" },
    ],
  });
  const result = planScene(
    scene,
    baseConfig({
      defaultPattern: {
        folderPattern: "{studio}",
        filenamePattern: "{stash_id}",
        stashBoxEndpoint: "https://theporndb.net/graphql",
      },
    }),
  );
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].basename, "bbb-222.mp4");
});

test("{stash_id} in a matched rule's own pattern uses THAT rule's stashBoxEndpoint, not the default pattern's", () => {
  const scene = Object.assign({}, normalOrganizedScene, {
    stash_ids: [
      { endpoint: "https://stashdb.org/graphql", stash_id: "aaa-111" },
    ],
  });
  const result = planScene(
    scene,
    baseConfig({
      rules: [
        {
          id: "r1",
          enabled: true,
          conditionLogic: "AND",
          conditions: [{ field: "studio", op: "any_of", value: ["s-leaf"] }],
          libraryRoot: "/data",
          folderPattern: "{studio}",
          filenamePattern: "{stash_id}",
          stashBoxEndpoint: "https://stashdb.org/graphql",
        },
      ],
      defaultPattern: { stashBoxEndpoint: "https://theporndb.net/graphql" },
    }),
  );
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].basename, "aaa-111.mp4");
});

test("non-optional {stash_id} errors when no stashBoxEndpoint is configured at all", () => {
  const result = planScene(
    normalOrganizedScene,
    baseConfig({
      defaultPattern: {
        folderPattern: "{studio}",
        filenamePattern: "{stash_id}",
      },
    }),
  );
  assert.equal(result.status, "error");
  assert.equal(result.reason, "missing_data");
  assert.match(
    result.missingData[0].message,
    /no stash-box source is configured/,
  );
});

test("a scene with no studio errors (not silently placeholdered) when the default pattern needs studio data", () => {
  const result = planScene(noStudioScene, baseConfig());
  assert.equal(result.status, "error");
  assert.equal(result.reason, "missing_data");
  assert.ok(result.missingData.some((m) => m.token === "studio_hierarchy"));
  assert.ok(
    result.missingData.some(
      (m) => m.message === "scene has no studio assigned",
    ),
  );
});

test("a deep (4-level) studio hierarchy resolves root/.../leaf correctly", () => {
  const result = planScene(
    deepStudioHierarchyScene,
    baseConfig({
      defaultPattern: {
        folderPattern: "{studio_root}/{studio_hierarchy}",
        filenamePattern: "{title}",
      },
    }),
  );
  assert.equal(result.status, "ok");
  assert.equal(
    result.files[0].folder,
    "/data/Network Root/Network Root/Level2/Level3/Leaf",
  );
});

test("a tag literally containing '/' never injects extra folder nesting", () => {
  const config = baseConfig({
    rules: [
      {
        conditions: [{ field: "tag", op: "any_of", value: ["t4"] }], // "Rock/Pop" tag's id
        folderPattern: "{tags}",
        filenamePattern: "{title}",
      },
    ],
  });
  const result = planScene(slashInTagScene, config);
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].folder, "/data/Rock Pop");
});

test("first-match-wins when a scene's tags satisfy more than one rule", () => {
  const config = baseConfig({
    rules: [
      {
        conditions: [{ field: "tag", op: "any_of", value: ["t1"] }],
        folderPattern: "RockPattern",
        filenamePattern: "{title}",
      }, // "Rock"
      {
        conditions: [{ field: "tag", op: "any_of", value: ["t2"] }],
        folderPattern: "PopPattern",
        filenamePattern: "{title}",
      }, // "Pop"
    ],
  });
  const result = planScene(multiRuleMatchScene, config);
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].folder, "/data/RockPattern");
});

test("a scene matching no rule falls through to the mandatory default pattern", () => {
  const config = baseConfig({
    rules: [
      {
        conditions: [
          { field: "tag", op: "any_of", value: ["tag-nonexistent"] },
        ],
        folderPattern: "X",
        filenamePattern: "{title}",
      },
    ],
  });
  const result = planScene(noRuleMatchScene, config);
  assert.equal(result.status, "ok");
  assert.equal(result.reason, "default");
  assert.equal(result.files[0].folder, "/data/Parent Co/Leaf Studio");
});

test("studio_hierarchy alone naturally collapses to just the studio name when there's no parent network", () => {
  const config = baseConfig({
    rules: [
      {
        id: "special-rule",
        conditions: [{ field: "tag", op: "any_of", value: ["t5"] }], // "SpecialTag"
        folderPattern: "{studio_hierarchy}",
        filenamePattern: "{title}",
      },
    ],
  });
  const result = planScene(tagMatchedButMissingStudioHierarchyScene, config);
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].folder, "/data/Standalone Studio");
  assert.equal(result.files[0].basename, "Tag Matched No Hierarchy.mp4");
});

test("a scene with genuinely no studio at all still errors when a rule's pattern needs studio data", () => {
  const config = baseConfig({
    rules: [
      {
        id: "special-rule",
        conditions: [{ field: "tag", op: "any_of", value: ["t3"] }], // "Amateur"
        folderPattern: "{studio_hierarchy}/{studio}",
        filenamePattern: "{title}",
      },
    ],
  });
  const result = planScene(noStudioScene, config);
  assert.equal(result.status, "error");
  assert.equal(result.reason, "missing_data");
  assert.deepEqual(
    result.missingData.map((m) => m.token),
    ["studio_hierarchy"],
  );
});

test("re-running planScene on a file already at its target path reports unchanged (fixed point)", () => {
  const scene = JSON.parse(JSON.stringify(normalOrganizedScene));
  scene.files[0].path =
    "/data/Parent Co/Leaf Studio/Leaf Studio - 2024-05-10 - Normal Scene.mp4";
  const result = planScene(scene, baseConfig());
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].unchanged, true);
});

test("CJK titles/studios/performers/tags survive end-to-end without corruption", () => {
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "{studio_hierarchy}",
      filenamePattern: "{performers} - {tags} - {title}",
    },
  });
  const result = planScene(cjkEmojiScene, config);
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].folder, "/data/親会社/スタジオ");
  assert.equal(
    result.files[0].basename,
    "パフォーマー - タグ - 日本語タイトル 🎬.mp4",
  );
});

test("performers_not_in_title excludes the performer already named in the title, end to end", () => {
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "{studio}",
      filenamePattern: "{performers_not_in_title?} - {title}",
    },
  });
  const result = planScene(performerNamedInTitleScene, config);
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].folder, "/data/Leaf Studio");
  // "Joy" is named in the title and excluded; "Amy" is not, and is kept
  assert.equal(
    result.files[0].basename,
    "Amy - A Day in the Park with Joy.mp4",
  );
});

test("{matched_performers} names the SPECIFIC performer a rule condition targeted, end to end", () => {
  const config = baseConfig({
    rules: [
      {
        id: "zed-rule",
        enabled: true,
        conditionLogic: "AND",
        conditions: [{ field: "performer", op: "any_of", value: ["p2"] }],
        folderPattern: "Performers/{matched_performers}",
        filenamePattern: "{title}",
      },
    ],
  });
  const result = planScene(multiFileScene, config);
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].folder, "/data/Performers/Zed");
});

test("planScene refuses to rename when the pattern produces no real filename, end to end", () => {
  const scene = {
    id: "999",
    title: "",
    date: "",
    organized: true,
    studio: null,
    performers: [],
    tags: [],
    files: [{ id: "1", path: "/data/old/unknown.mp4" }],
  };
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "{studio?}",
      filenamePattern: "<{title?}> <{performers?}>",
    },
  });
  const result = planScene(scene, config);
  assert.equal(result.status, "error");
  assert.equal(result.reason, "empty_filename");
  assert.equal(result.files.length, 0);
});

test("planScene refuses to rename when a pattern's basename-only token renders blank behind a non-empty folder literal, end to end", () => {
  const scene = {
    id: "997",
    title: "Amy and Zed",
    date: "2024-01-01",
    organized: true,
    studio: null,
    performers: [
      { id: "1", name: "Amy" },
      { id: "2", name: "Zed" },
    ],
    tags: [],
    files: [{ id: "1", path: "/data/old/unknown.mp4" }],
  };
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "swag",
      filenamePattern: "{performers_not_in_title}",
    },
  });
  const result = planScene(scene, config);
  assert.equal(result.status, "error");
  assert.equal(result.reason, "empty_filename");
  assert.equal(result.files.length, 0);
});

test("planScene refuses to rename when the basename is built entirely from file metadata tokens on a scene without Stash metadata", () => {
  const scene = {
    id: "998",
    title: "",
    date: "",
    organized: true,
    studio: null,
    performers: [],
    tags: [],
    files: [
      {
        id: "1",
        path: "/data/old/unknown.mp4",
        width: 3840,
        height: 2160,
        video_codec: "hevc",
      },
    ],
  };
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "{studio?}",
      filenamePattern: "{video_codec} {resolution}",
    },
  });
  const result = planScene(scene, config);
  assert.equal(result.status, "error");
  assert.equal(result.reason, "no_identifying_metadata");
  assert.equal(result.files.length, 0);
});

test("a file metadata pattern is fine when the scene ALSO has real metadata contributing to the filename", () => {
  const scene = {
    id: "997",
    title: "Real Title",
    date: "",
    organized: true,
    studio: null,
    performers: [],
    tags: [],
    files: [
      { id: "1", path: "/data/old/unknown.mp4", width: 3840, height: 2160 },
    ],
  };
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "",
      filenamePattern: "{resolution} - {title}",
    },
  });
  const result = planScene(scene, config);
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].basename, "4K - Real Title.mp4");
});

test("excludeConditions: a scene matching an excluded tag is always skipped, even when a rule would otherwise match it", () => {
  const config = baseConfig({
    excludeConditions: {
      conditionLogic: "OR",
      conditions: [{ field: "tag", op: "any_of", value: ["t1"] }], // "Rock", per normalOrganizedScene's fixture
    },
    rules: [
      {
        id: "r1",
        enabled: true,
        conditionLogic: "AND",
        conditions: [{ field: "tag", op: "any_of", value: ["t1"] }],
        folderPattern: "Should/Never",
        filenamePattern: "Render",
      },
    ],
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "excluded");
  assert.deepEqual(result.excludedBy, ["tag is 'Rock'"]);
});

test("excludeConditions: all_of requires every excluded tag to be present, not just one", () => {
  // normalOrganizedScene only has tag t1 ("Rock") — requiring BOTH t1 and a
  // tag it doesn't have means this scene is NOT excluded.
  const config = baseConfig({
    excludeConditions: {
      conditionLogic: "OR",
      conditions: [
        { field: "tag", op: "all_of", value: ["t1", "t-nonexistent"] },
      ],
    },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "ok");
});

test("excludeConditions: zero conditions disables the feature (never excludes anything)", () => {
  const config = baseConfig({
    excludeConditions: { conditionLogic: "OR", conditions: [] },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "ok");
});

test("excludeConditions: a studio condition excludes a scene whose own (leaf) studio is selected", () => {
  const config = baseConfig({
    excludeConditions: {
      conditionLogic: "OR",
      conditions: [{ field: "studio", op: "any_of", value: ["s-leaf"] }], // normalOrganizedScene's leaf studio
    },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "excluded");
  assert.deepEqual(result.excludedBy, ["studio is 'Leaf Studio'"]);
});

test("excludeConditions: studio any_of_or_descendant excludes a scene whose studio is a DESCENDANT of the selected one", () => {
  const config = baseConfig({
    excludeConditions: {
      conditionLogic: "OR",
      conditions: [
        { field: "studio", op: "any_of_or_descendant", value: ["s-parent"] },
      ],
    },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "excluded");
  assert.deepEqual(result.excludedBy, [
    "studio is 'Parent Co' (including subsidiaries)",
  ]);
});

test("excludeConditions: a plain 'studio' condition does NOT match on an ancestor id, unlike any_of_or_descendant", () => {
  const config = baseConfig({
    excludeConditions: {
      conditionLogic: "OR",
      conditions: [{ field: "studio", op: "any_of", value: ["s-parent"] }],
    },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "ok");
});

test("excludeConditions: a path condition excludes a scene with a matching file path", () => {
  // normalOrganizedScene's one file is at "/data/old/old.mp4".
  const config = baseConfig({
    excludeConditions: {
      conditionLogic: "OR",
      conditions: [{ field: "path", op: "INCLUDES", value: "/old/" }],
    },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "excluded");
  assert.deepEqual(result.excludedBy, ["path contains '/old/'"]);
});

test("excludeConditions: a non-matching path condition does not exclude the scene", () => {
  const config = baseConfig({
    excludeConditions: {
      conditionLogic: "OR",
      conditions: [{ field: "path", op: "INCLUDES", value: "/nonexistent/" }],
    },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "ok");
});

test("excludeConditions: OR logic across DIFFERENT field types excludes if ANY one matches", () => {
  const config = baseConfig({
    excludeConditions: {
      conditionLogic: "OR",
      conditions: [
        { field: "tag", op: "any_of", value: ["t-nonexistent"] },
        { field: "path", op: "INCLUDES", value: "/old/" }, // this one matches
      ],
    },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "excluded");
  assert.deepEqual(result.excludedBy, ["path contains '/old/'"]);
});

test("excludeConditions: AND logic across different field types requires ALL of them to match", () => {
  const config = baseConfig({
    excludeConditions: {
      conditionLogic: "AND",
      conditions: [
        { field: "tag", op: "any_of", value: ["t1"] }, // matches
        { field: "path", op: "INCLUDES", value: "/nonexistent/" }, // does not
      ],
    },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "ok");
});

test("excludeConditions: AND logic where every condition matches reports ALL of them in excludedBy", () => {
  const config = baseConfig({
    excludeConditions: {
      conditionLogic: "AND",
      conditions: [
        { field: "tag", op: "any_of", value: ["t1"] },
        { field: "path", op: "INCLUDES", value: "/old/" },
      ],
    },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "skipped");
  assert.deepEqual(result.excludedBy, [
    "tag is 'Rock'",
    "path contains '/old/'",
  ]);
});

test("excludeConditions: OR logic where MULTIPLE conditions independently match reports all of the ones that actually did", () => {
  const config = baseConfig({
    excludeConditions: {
      conditionLogic: "OR",
      conditions: [
        { field: "tag", op: "any_of", value: ["t1"] },
        { field: "path", op: "INCLUDES", value: "/old/" },
      ],
    },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "skipped");
  assert.deepEqual(result.excludedBy, [
    "tag is 'Rock'",
    "path contains '/old/'",
  ]);
});

test("file metadata tokens (resolution, codecs, bitrate, phash, rating) render end to end from the file being named", () => {
  // normalOrganizedScene's one file: 1920x1080/h264/aac/8000000bps/phash
  // "abc123def456", rating100: 85.
  const config = baseConfig({
    defaultPattern: {
      folderPattern:
        "{resolution}/{video_codec}-{audio_codec} - {bitrate} - {phash} - {rating}",
      filenamePattern: "{title}",
    },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "ok");
  assert.equal(
    result.files[0].folder,
    "/data/1080p/h264-aac - 8.00Mbps - abc123def456 - 8.5",
  );
  assert.equal(result.files[0].basename, "Normal Scene.mp4");
});

test("technical metadata tokens differ PER FILE on a multi-file scene", () => {
  const scene = {
    id: "500",
    title: "Multi Res Scene",
    date: "2024-06-01",
    organized: true,
    studio: { id: "s-leaf", name: "Leaf Studio", parent_studio: null },
    performers: [],
    tags: [],
    files: [
      {
        id: "10",
        path: "/data/old/scene-1080p.mp4",
        width: 1920,
        height: 1080,
        video_codec: "h264",
      },
      {
        id: "11",
        path: "/data/old/scene-4k.mp4",
        width: 3840,
        height: 2160,
        video_codec: "hevc",
      },
    ],
  };
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "{studio}/{resolution}",
      filenamePattern: "{title} [{video_codec}]",
    },
  });
  const result = planScene(scene, config);
  assert.equal(result.status, "ok");
  const byId = Object.fromEntries(result.files.map((f) => [f.fileId, f]));
  assert.equal(byId["10"].folder, "/data/Leaf Studio/1080p");
  assert.equal(byId["10"].basename, "Multi Res Scene [h264].mp4");
  assert.equal(byId["11"].folder, "/data/Leaf Studio/4K");
  assert.equal(byId["11"].basename, "Multi Res Scene [hevc].mp4");
});

test("files that render to the SAME folder+basename suffixed, unaffected by per-file rendering", () => {
  const scene = {
    id: "501",
    title: "Same Name Scene",
    date: "2024-06-01",
    organized: true,
    studio: { id: "s-leaf", name: "Leaf Studio", parent_studio: null },
    performers: [],
    tags: [],
    files: [
      { id: "20", path: "/data/old/a.mp4", width: 1920, height: 1080 },
      { id: "21", path: "/data/old/b.mp4", width: 3840, height: 2160 },
    ],
  };
  const config = baseConfig({
    defaultPattern: { folderPattern: "{studio}", filenamePattern: "{title}" },
  });
  const result = planScene(scene, config);
  assert.equal(result.status, "ok");
  const byId = Object.fromEntries(result.files.map((f) => [f.fileId, f]));
  assert.equal(byId["20"].folder, "/data/Leaf Studio");
  assert.equal(byId["20"].basename, "Same Name Scene.mp4");
  assert.equal(byId["21"].folder, "/data/Leaf Studio");
  assert.equal(byId["21"].basename, "Same Name Scene (2).mp4");
});

test("an optional per-file token missing on only ONE file renders empty for that file, without erroring the whole scene", () => {
  const scene = {
    id: "502",
    title: "Partial Scene",
    date: "2024-06-01",
    organized: true,
    studio: { id: "s-leaf", name: "Leaf Studio", parent_studio: null },
    performers: [],
    tags: [],
    files: [
      {
        id: "30",
        path: "/data/old/a.mp4",
        fingerprints: [{ type: "phash", value: "legit-hash" }],
      },
      // Missing phash
      { id: "31", path: "/data/old/b.mp4" },
    ],
  };
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "",
      filenamePattern: "{title} {phash?}",
    },
  });
  const result = planScene(scene, config);
  assert.equal(result.status, "ok");
  const byId = Object.fromEntries(result.files.map((f) => [f.fileId, f]));
  assert.equal(byId["30"].basename, "Partial Scene legit-hash.mp4");
  assert.equal(byId["31"].basename, "Partial Scene.mp4");
});

test("a rule's own sortBy controls {performers} ordering for ITS pattern, independent of another rule or the default pattern", () => {
  const scene = {
    id: "600",
    title: "Sort Order Scene",
    date: "2024-06-01",
    organized: true,
    studio: { id: "s-leaf", name: "Leaf Studio", parent_studio: null },
    performers: [
      { id: "p1", name: "Wendy", favorite: true, rating100: 70 },
      { id: "p2", name: "Zed", favorite: false, rating100: 95 },
      { id: "p3", name: "Bo", favorite: false, rating100: null },
    ],
    tags: [{ id: "t1", name: "Rock" }],
    files: [{ id: "1", path: "/data/old/scene.mp4" }],
  };

  function planWithSortBy(sortBy) {
    return planScene(
      scene,
      baseConfig({
        rules: [
          {
            id: "r1",
            enabled: true,
            conditionLogic: "AND",
            conditions: [{ field: "tag", op: "any_of", value: ["t1"] }],
            folderPattern: "",
            filenamePattern: "{performers}",
            sortBy: sortBy,
          },
        ],
      }),
    );
  }

  assert.equal(
    planWithSortBy("favorite_first").files[0].basename,
    "Wendy, Bo, Zed.mp4",
  );
  assert.equal(
    planWithSortBy("rating").files[0].basename,
    "Zed, Wendy, Bo.mp4",
  );
  assert.equal(
    planWithSortBy(undefined).files[0].basename,
    "Bo, Wendy, Zed.mp4",
  );
});

test("a matched rule's OWN libraryRoot is used, not the default pattern's", () => {
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "{studio_hierarchy}",
      filenamePattern: "{studio} - {date} - {title}",
      sortBy: "alphabetical",
      libraryRoot: "/data/main",
    },
    rules: [
      {
        id: "archive-rule",
        enabled: true,
        conditionLogic: "AND",
        conditions: [{ field: "tag", op: "any_of", value: ["t1"] }],
        folderPattern: "/",
        filenamePattern: "{title}",
        libraryRoot: "/data/archive",
      },
    ],
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].folder, "/data/archive");
});

test("a scene matching no rule uses the default pattern's own libraryRoot", () => {
  const config = baseConfig({
    rules: [
      {
        id: "archive-rule",
        enabled: true,
        conditionLogic: "AND",
        conditions: [
          { field: "tag", op: "any_of", value: ["tag-nonexistent"] },
        ],
        folderPattern: "/",
        filenamePattern: "{title}",
        libraryRoot: "/data/archive",
      },
    ],
  });
  const result = planScene(noRuleMatchScene, config);
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].folder, "/data/Parent Co/Leaf Studio");
});

test("a matched rule with NO libraryRoot of its own errors as 'no_library_root', not a silent skip or a bad path", () => {
  const config = normalizeConfig({
    defaultPattern: {
      folderPattern: "/",
      filenamePattern: "{title}",
      libraryRoot: "/data/main",
    },
    rules: [
      {
        id: "unrooted-rule",
        enabled: true,
        conditionLogic: "AND",
        conditions: [{ field: "tag", op: "any_of", value: ["t1"] }],
        folderPattern: "/",
        filenamePattern: "{title}",
      },
    ],
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "error");
  assert.equal(result.reason, "no_library_root");
  assert.equal(result.matchedRule, "unrooted-rule");
  assert.ok(result.missingData[0].message.indexOf("matched rule") !== -1);
});

test("a scene falling through to a default pattern with NO libraryRoot errors as 'no_library_root' too", () => {
  const config = normalizeConfig({
    defaultPattern: { folderPattern: "/", filenamePattern: "{title}" },
    rules: [],
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "error");
  assert.equal(result.reason, "no_library_root");
  assert.equal(result.matchedRule, null);
  assert.ok(result.missingData[0].message.indexOf("default pattern") !== -1);
});

test("a Windows file already at its target reports unchanged, not 'will move'", () => {
  // Regression: splitPath only split on "/", so on Windows the whole path became
  // the basename, the current folder was empty, and every file looked like a move
  const config = normalizeConfig({
    onlyOrganized: false,
    defaultPattern: {
      folderPattern: "{studio}",
      filenamePattern: "{studio} - {title}",
      libraryRoot: "C:\\Stash\\Library",
    },
  });
  const scene = {
    id: "1",
    title: "My Show",
    organized: true,
    studio: { id: "s1", name: "Acme" },
    performers: [],
    tags: [],
    stash_ids: [],
    files: [
      {
        id: "10",
        path: "C:\\Stash\\Library\\Acme\\Acme - My Show.mp4",
        width: 1920,
        height: 1080,
        video_codec: "h264",
        audio_codec: "aac",
        bit_rate: 8000000,
        frame_rate: 30,
        fingerprints: [],
      },
    ],
  };
  const file = planScene(scene, config).files[0];
  assert.equal(file.currentBasename, "Acme - My Show.mp4");
  assert.equal(file.unchanged, true);
});

test("a library root stored with forward slashes still matches a Windows file path", () => {
  const config = normalizeConfig({
    onlyOrganized: false,
    defaultPattern: {
      folderPattern: "{studio}",
      filenamePattern: "{studio} - {title}",
      libraryRoot: "C:/Stash/Library",
    },
  });
  const scene = {
    id: "1",
    title: "My Show",
    organized: true,
    studio: { id: "s1", name: "Acme" },
    performers: [],
    tags: [],
    stash_ids: [],
    files: [
      {
        id: "10",
        path: "C:\\Stash\\Library\\Acme\\Acme - My Show.mp4",
        width: 1920,
        height: 1080,
        video_codec: "h264",
        audio_codec: "aac",
        bit_rate: 8000000,
        frame_rate: 30,
        fingerprints: [],
      },
    ],
  };
  assert.equal(planScene(scene, config).files[0].unchanged, true);
});

function sceneWithStashIds(endpoints) {
  return Object.assign({}, normalOrganizedScene, {
    stash_ids: endpoints.map((e, i) => ({ endpoint: e, stash_id: "id-" + i })),
  });
}

test("onlyWithStashId accepts a StashID from any source when no sources are chosen", () => {
  const config = baseConfig({ onlyWithStashId: true, stashIdEndpoints: [] });
  assert.equal(
    planScene(sceneWithStashIds(["https://a/graphql"]), config).status,
    "ok",
  );
  assert.equal(planScene(sceneWithStashIds([]), config).status, "skipped");
});

test("onlyWithStashId requires a StashID from one of the chosen sources", () => {
  const config = baseConfig({
    onlyWithStashId: true,
    stashIdEndpoints: ["https://a/graphql", "https://b/graphql"],
  });
  assert.equal(
    planScene(sceneWithStashIds(["https://a/graphql"]), config).status,
    "ok",
  );
  assert.equal(
    planScene(sceneWithStashIds(["https://b/graphql"]), config).status,
    "ok",
  );
  assert.equal(
    planScene(
      sceneWithStashIds(["https://a/graphql", "https://c/graphql"]),
      config,
    ).status,
    "ok",
  );

  // a StashID only from an unchosen source is not enough
  const skipped = planScene(sceneWithStashIds(["https://c/graphql"]), config);
  assert.equal(skipped.status, "skipped");
  assert.equal(skipped.reason, "no_stash_id");
});

test("chosen sources are ignored while onlyWithStashId is off", () => {
  const config = baseConfig({
    onlyWithStashId: false,
    stashIdEndpoints: ["https://a/graphql"],
  });
  assert.equal(planScene(sceneWithStashIds([]), config).status, "ok");
});

test("a blank folder pattern keeps the file in its current folder rather than flattening to the library root", () => {
  const config = baseConfig({
    defaultPattern: { folderPattern: "", filenamePattern: "{title}" },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].folder, "/data/old");
  assert.equal(result.files[0].basename, "Normal Scene.mp4");
});

test("a blank folder pattern moves by parent folder id so the path is never re-parsed", () => {
  const config = baseConfig({
    defaultPattern: { folderPattern: "", filenamePattern: "{title}" },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.files[0].folderId, "f-old");
});

test("a blank folder pattern needs no libraryRoot, since the file never leaves its folder", () => {
  const config = normalizeConfig({
    defaultPattern: { folderPattern: "", filenamePattern: "{title}" },
    rules: [],
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].folder, "/data/old");
});

test("a blank folder pattern reports unchanged when the basename already matches", () => {
  const config = baseConfig({
    defaultPattern: { folderPattern: "", filenamePattern: "old" },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.files[0].basename, "old.mp4");
  assert.equal(result.files[0].unchanged, true);
});

test("an explicit / folder pattern still targets the library root", () => {
  const config = baseConfig({
    defaultPattern: { folderPattern: "/", filenamePattern: "{title}" },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].folder, "/data");
  assert.equal(result.files[0].folderId, null);
});

test("a non-empty folder pattern that renders empty errors instead of silently flattening to the root", () => {
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "{studio?}",
      filenamePattern: "{title}",
    },
  });
  const result = planScene(noStudioScene, config);
  assert.equal(result.status, "error");
  assert.equal(result.reason, "empty_folder");
  assert.ok(result.missingData[0].message.indexOf("library root") !== -1);
});

test("whitespace-only folder patterns keep files put rather than creating a folder named _", () => {
  const config = baseConfig({
    defaultPattern: { folderPattern: "   ", filenamePattern: "{title}" },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].folder, "/data/old");
});

test("re-planning the same raw scene with a changed config yields the new result, which is what the preview's local re-plan relies on", () => {
  const raw = JSON.parse(JSON.stringify(normalOrganizedScene));
  const before = planScene(raw, baseConfig());
  const after = planScene(
    raw,
    baseConfig({
      defaultPattern: { folderPattern: "{studio}", filenamePattern: "{title}" },
    }),
  );
  assert.equal(before.files[0].folder, "/data/Parent Co/Leaf Studio");
  assert.equal(after.files[0].folder, "/data/Leaf Studio");
  assert.equal(after.files[0].basename, "Normal Scene.mp4");
});

test("planning does not mutate the raw scene it was given, so a row can be re-planned repeatedly", () => {
  const raw = JSON.parse(JSON.stringify(normalOrganizedScene));
  const snapshot = JSON.stringify(raw);
  planScene(raw, baseConfig());
  planScene(raw, baseConfig({ defaultPattern: { folderPattern: "{studio}" } }));
  assert.equal(JSON.stringify(raw), snapshot);
});
