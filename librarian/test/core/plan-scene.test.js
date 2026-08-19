import test from "node:test";
import assert from "node:assert/strict";
import {
  planScene,
  planEntity,
  entitySettings,
  configNeedsStashBoxes,
} from "../../src/core/plan-scene.js";
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

  // the composable form, and the combination the legacy strings could not express:
  // Wendy is the only favourite, then the rest by rating
  assert.equal(
    planWithSortBy(["favorite", "rating"]).files[0].basename,
    "Wendy, Zed, Bo.mp4",
  );
  assert.equal(
    planWithSortBy(["favorite"]).files[0].basename,
    "Wendy, Bo, Zed.mp4",
  );
  assert.equal(
    planWithSortBy(["rating"]).files[0].basename,
    "Zed, Wendy, Bo.mp4",
  );
  assert.equal(planWithSortBy([]).files[0].basename, "Bo, Wendy, Zed.mp4");
});

test("a rule's sort criteria win over the default pattern's", () => {
  const scene = {
    id: "601",
    title: "Precedence",
    organized: true,
    performers: [
      { id: "p1", name: "Wendy", favorite: true, rating100: 70 },
      { id: "p2", name: "Zed", favorite: false, rating100: 95 },
    ],
    tags: [{ id: "t1", name: "Rock" }],
    files: [{ id: "1", path: "/data/old/scene.mp4" }],
  };
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "",
      filenamePattern: "{performers}",
      sortBy: ["rating"],
    },
    rules: [
      {
        id: "r1",
        enabled: true,
        conditionLogic: "AND",
        conditions: [{ field: "tag", op: "any_of", value: ["t1"] }],
        folderPattern: "",
        filenamePattern: "{performers}",
        sortBy: ["favorite"],
      },
    ],
  });
  assert.equal(planScene(scene, config).files[0].basename, "Wendy, Zed.mp4");

  // with no rule matching, the default pattern's criteria apply instead
  const noMatch = Object.assign({}, scene, { tags: [] });
  assert.equal(planScene(noMatch, config).files[0].basename, "Zed, Wendy.mp4");
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

test("a blank filename pattern keeps each file's own name while the folder pattern still moves it", () => {
  const config = baseConfig({
    defaultPattern: { folderPattern: "{studio}", filenamePattern: "" },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].folder, "/data/Leaf Studio");
  assert.equal(result.files[0].basename, "old.mp4");
  assert.equal(result.files[0].unchanged, false);
});

test("whitespace-only filename patterns keep the current name rather than renaming to _", () => {
  const config = baseConfig({
    defaultPattern: { folderPattern: "{studio}", filenamePattern: "   " },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.files[0].basename, "old.mp4");
});

test("a kept filename skips sanitization, which would otherwise rename the very file a blank pattern spares", () => {
  const scene = {
    id: "504",
    title: "Spaced Scene",
    organized: true,
    studio: { id: "s-leaf", name: "Leaf Studio", parent_studio: null },
    performers: [],
    tags: [],
    files: [{ id: "50", path: "/data/old/my file.mp4" }],
  };
  const kept = planScene(
    scene,
    baseConfig({
      sanitize: { spaceReplacement: "." },
      defaultPattern: { folderPattern: "{studio}", filenamePattern: "" },
    }),
  );
  assert.equal(kept.files[0].basename, "my file.mp4");
  // the same setting does still apply to a name the pattern renders
  const rendered = planScene(
    scene,
    baseConfig({
      sanitize: { spaceReplacement: "." },
      defaultPattern: { folderPattern: "{studio}", filenamePattern: "{title}" },
    }),
  );
  assert.equal(rendered.files[0].basename, "Spaced.Scene.mp4");
});

test("a blank filename pattern does not trip the guards that only judge a rendered name", () => {
  const scene = {
    id: "503",
    title: "",
    organized: true,
    studio: null,
    performers: [],
    tags: [],
    files: [{ id: "40", path: "/data/old/untitled.mp4" }],
  };
  const config = baseConfig({
    defaultPattern: { folderPattern: "/", filenamePattern: "" },
  });
  const result = planScene(scene, config);
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].folder, "/data");
  assert.equal(result.files[0].basename, "untitled.mp4");
});

test("kept names converging on one folder from different folders are still suffixed", () => {
  const scene = {
    id: "502",
    title: "Converging Scene",
    organized: true,
    studio: { id: "s-leaf", name: "Leaf Studio", parent_studio: null },
    performers: [],
    tags: [],
    files: [
      { id: "30", path: "/data/a/clip.mp4" },
      { id: "31", path: "/data/b/clip.mp4" },
    ],
  };
  const config = baseConfig({
    defaultPattern: { folderPattern: "{studio}", filenamePattern: "" },
  });
  const byId = Object.fromEntries(
    planScene(scene, config).files.map((f) => [f.fileId, f.basename]),
  );
  assert.equal(byId["30"], "clip.mp4");
  assert.equal(byId["31"], "clip (2).mp4");
});

test("kept names that differ only by extension are left alone, since they never actually collide", () => {
  const scene = {
    id: "505",
    title: "Two Formats Scene",
    organized: true,
    studio: { id: "s-leaf", name: "Leaf Studio", parent_studio: null },
    performers: [],
    tags: [],
    files: [
      { id: "60", path: "/data/a/clip.mp4" },
      { id: "61", path: "/data/b/clip.mkv" },
    ],
  };
  const config = baseConfig({
    defaultPattern: { folderPattern: "{studio}", filenamePattern: "" },
  });
  const byId = Object.fromEntries(
    planScene(scene, config).files.map((f) => [f.fileId, f.basename]),
  );
  assert.equal(byId["60"], "clip.mp4");
  assert.equal(byId["61"], "clip.mkv");
});

test("blank folder AND filename patterns are skipped rather than planned as a no-op", () => {
  const config = baseConfig({
    defaultPattern: { folderPattern: "", filenamePattern: "" },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "nothing_to_change");
  assert.deepEqual(result.files, []);
});

test("an all-blank rule holds its matches back from the default pattern, which is what makes it an escape hatch", () => {
  const config = baseConfig({
    rules: [
      {
        id: "leave-alone",
        enabled: true,
        conditionLogic: "AND",
        conditions: [{ field: "tag", op: "any_of", value: ["t1"] }],
        folderPattern: "",
        filenamePattern: "",
      },
    ],
    defaultPattern: { folderPattern: "{studio}", filenamePattern: "{title}" },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "nothing_to_change");
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

test("a stray top-level scene gate cannot leak into galleries or images", () => {
  // only delimiters and sanitize are global; anything else belongs to a section
  const settings = entitySettings(
    {
      onlyWithStashId: true,
      stashIdEndpoints: ["https://a/graphql"],
      delimiters: { performers: " & " },
      sanitize: { spaceReplacement: "." },
      images: { onlyOrganized: true },
    },
    "images",
  );
  assert.equal(settings.onlyWithStashId, undefined);
  assert.equal(settings.stashIdEndpoints, undefined);
  assert.equal(settings.onlyOrganized, true);
  assert.equal(settings.delimiters.performers, " & ");
  assert.equal(settings.sanitize.spaceReplacement, ".");
});

test("missing-data messages name the entity type, not always 'scene'", () => {
  const config = normalizeConfig({
    images: {
      onlyOrganized: false,
      defaultPattern: {
        folderPattern: "",
        filenamePattern: "{title}",
        libraryRoot: "",
      },
    },
    galleries: {
      onlyOrganized: false,
      defaultPattern: {
        folderPattern: "",
        filenamePattern: "{title}",
        libraryRoot: "",
      },
    },
  });
  const untitledImage = {
    id: "1",
    organized: true,
    visual_files: [
      {
        id: "f",
        path: "/data/a.jpg",
        zip_file_id: null,
        parent_folder: { id: "p" },
      },
    ],
  };
  const untitledGallery = {
    id: "2",
    organized: true,
    files: [{ id: "g", path: "/data/a.zip", parent_folder: { id: "p" } }],
    folder: null,
  };

  assert.equal(
    planEntity(untitledImage, config, "images").missingData[0].message,
    "image has no title",
  );
  assert.equal(
    planEntity(untitledGallery, config, "galleries").missingData[0].message,
    "gallery has no title",
  );
  // scenes are unchanged
  assert.equal(
    planScene(noStudioScene, baseConfig()).missingData[0].message,
    "scene has no studio assigned",
  );
});

test("a mistyped modifier refuses to rename instead of silently filtering to nothing", () => {
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "",
      filenamePattern: "{performers|gender=femal}",
    },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "error");
  assert.equal(result.reason, "invalid_pattern");
  assert.match(result.missingData[0].message, /no gender "femal"/);
  // and the message names the valid ones, since nothing else will
  assert.match(result.missingData[0].message, /trans_female/);
});

test("an unknown modifier is caught in the folder pattern too", () => {
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "{performers|bogus=1}",
      filenamePattern: "{title}",
    },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.reason, "invalid_pattern");
});

// The gate is deliberately narrow: these have always rendered literally and
// must keep working, or an existing user's typo would start failing renames.
test("an unknown or malformed token still renders literally rather than blocking", () => {
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "",
      filenamePattern: "{title} {nonsense} {studio bogus}",
    },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "ok");
  assert.match(result.files[0].basename, /\{nonsense\}/);
  assert.match(result.files[0].basename, /\{studio bogus\}/);
});

test("a valid gender filter plans normally", () => {
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "",
      filenamePattern: "{performers|gender=female?}-{title}",
    },
  });
  const result = planScene(normalOrganizedScene, config);
  assert.equal(result.status, "ok");
});

const STASH_BOXES = [
  { name: "StashDB", endpoint: "https://stashdb.org/graphql" },
  { name: "ThePornDB", endpoint: "https://theporndb.net/graphql" },
];

function twoIdScene() {
  return Object.assign({}, normalOrganizedScene, {
    stash_ids: [
      { endpoint: "https://stashdb.org/graphql", stash_id: "aaa-111" },
      { endpoint: "https://theporndb.net/graphql", stash_id: "bbb-222" },
    ],
  });
}

test("a pattern can carry StashIDs from several sources at once", () => {
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "",
      filenamePattern: "{stash_id|from=StashDB}-{stash_id|from=ThePornDB}",
    },
  });
  const result = planScene(twoIdScene(), config, STASH_BOXES);
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].basename, "aaa-111-bbb-222.mp4");
});

test("a from= naming no configured stash-box refuses to rename", () => {
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "",
      filenamePattern: "{stash_id|from=Bogus}",
    },
  });
  const result = planScene(twoIdScene(), config, STASH_BOXES);
  assert.equal(result.status, "error");
  assert.equal(result.reason, "invalid_pattern");
});

test("omitting the stash-box list fails safe rather than renaming", () => {
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "",
      filenamePattern: "{stash_id|from=StashDB}",
    },
  });
  const result = planScene(twoIdScene(), config);
  assert.notEqual(result.status, "ok");
  assert.equal(result.reason, "missing_data");
});

test("with a single configured stash-box, {stash_id} works with nothing configured", () => {
  const config = baseConfig({
    defaultPattern: { folderPattern: "", filenamePattern: "{stash_id}" },
  });
  const oneBox = [STASH_BOXES[0]];
  assert.equal(
    planScene(twoIdScene(), config, oneBox).files[0].basename,
    "aaa-111.mp4",
  );
  // two boxes is ambiguous, so it stays an error rather than picking one
  assert.equal(planScene(twoIdScene(), config, STASH_BOXES).status, "error");
});

test("configNeedsStashBoxes only asks for the list when it could matter", () => {
  const needs = (overrides) =>
    configNeedsStashBoxes(baseConfig(overrides), "scenes");

  // no stash_id anywhere: never worth a query
  assert.equal(
    needs({ defaultPattern: { filenamePattern: "{title}" } }),
    false,
  );
  // a stored source answers it without the list
  assert.equal(
    needs({
      defaultPattern: {
        filenamePattern: "{stash_id}",
        stashBoxEndpoint: "https://stashdb.org/graphql",
      },
    }),
    false,
  );
  // from= always needs it
  assert.equal(
    needs({ defaultPattern: { filenamePattern: "{stash_id|from=StashDB}" } }),
    true,
  );
  assert.equal(
    needs({ defaultPattern: { filenamePattern: "{stash_id}" } }),
    true,
  );
  // a disabled rule cannot contribute
  assert.equal(
    needs({
      defaultPattern: {
        filenamePattern: "{title}",
        stashBoxEndpoint: "https://stashdb.org/graphql",
      },
      rules: [
        {
          id: "r1",
          enabled: false,
          filenamePattern: "{stash_id|from=StashDB}",
          conditions: [],
        },
      ],
    }),
    false,
  );
  // a rule inheriting a default that also has no source still needs it
  assert.equal(
    needs({
      defaultPattern: { filenamePattern: "{title}" },
      rules: [
        {
          id: "r1",
          enabled: true,
          filenamePattern: "{stash_id}",
          conditions: [],
        },
      ],
    }),
    true,
  );
});

test("galleries and images never need the stash-box list, having no {stash_id}", () => {
  const config = baseConfig({
    defaultPattern: { filenamePattern: "{stash_id|from=StashDB}" },
  });
  assert.equal(configNeedsStashBoxes(config, "galleries"), false);
  assert.equal(configNeedsStashBoxes(config, "images"), false);
});

// {current} is the only token that reads what the pattern writes, so it is the
// only one whose modifiers can fail to settle. The planner renders a second
// time from the name it just produced: if that moves again, every run would
// rename the file, so it refuses instead
test("a pattern using {current} that never settles is refused", () => {
  const grows = baseConfig({
    defaultPattern: {
      folderPattern: "{current}",
      filenamePattern: "{current|regex=/o/oo/}",
    },
  });
  const result = planScene(normalOrganizedScene, grows);
  assert.equal(result.status, "error");
  assert.equal(result.reason, "unstable_pattern");
  assert.match(result.missingData[0].message, /does not settle/);
});

test("{current} with a modifier that does settle is planned normally", () => {
  const stable = baseConfig({
    defaultPattern: {
      folderPattern: "{current}",
      filenamePattern: "{current|uppercase}",
    },
  });
  const result = planScene(normalOrganizedScene, stable);
  assert.equal(result.status, "ok");
  assert.equal(result.files[0].basename, "OLD.mp4");
});

test("{current} on both sides is the keep-in-place pair, reported as unchanged", () => {
  const keep = baseConfig({
    defaultPattern: {
      folderPattern: "{current}",
      filenamePattern: "{current}",
    },
  });
  const result = planScene(normalOrganizedScene, keep);
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "nothing_to_change");
});

test("a literal blank pattern is refused, naming the token to write instead", () => {
  const blank = baseConfig({
    defaultPattern: { folderPattern: "{studio}", filenamePattern: "" },
  });
  // normalizeConfig migrates blanks, so reach past it to simulate a hand-edit
  blank.scenes.defaultPattern.filenamePattern = "";
  const result = planScene(normalOrganizedScene, blank);
  assert.equal(result.status, "error");
  assert.equal(result.reason, "blank_pattern");
  assert.match(result.missingData[0].message, /\{current\}/);
});

// A scene in several groups still renames, deterministically, but the row says
// which group was used: the choice is ours, not the user's
test("a scene in several groups is planned with a warning naming the pick", () => {
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "{group}",
      filenamePattern: "{title} [Sc. {group_idx}]",
    },
  });
  const scene = Object.assign({}, normalOrganizedScene, {
    groups: [
      { scene_index: 9, group: { id: "42", name: "Later Compilation" } },
      { scene_index: 1, group: { id: "7", name: "Teen Dreams" } },
    ],
  });
  const result = planScene(scene, config);
  assert.equal(result.status, "ok");
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /Teen Dreams/);
  assert.match(result.warnings[0], /Later Compilation/);
  assert.equal(result.files[0].folder, "/data/Teen Dreams");
});

test("a single group plans with no warning at all", () => {
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "{group}",
      filenamePattern: "{title} [Sc. {group_idx}]",
    },
  });
  const scene = Object.assign({}, normalOrganizedScene, {
    groups: [{ scene_index: 1, group: { id: "7", name: "Teen Dreams" } }],
  });
  const result = planScene(scene, config);
  assert.equal(result.status, "ok");
  assert.deepEqual(result.warnings, []);
});

// Stash's unique key is name+disambiguation, so a pattern rendering the name
// alone can send two different performers to one folder. The plan still runs:
// it is ambiguous, not wrong
function disambiguationScene(performers) {
  return Object.assign({}, normalOrganizedScene, { performers: performers });
}

const AMBIGUOUS_PERFORMERS = [
  { id: "p1", name: "Alex Rivera", disambiguation: "Blonde" },
  { id: "p2", name: "Marcus Chen" },
];

test("a disambiguated performer warns when the pattern renders the name alone", () => {
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "{performers}",
      filenamePattern: "{title}",
    },
  });
  const result = planScene(disambiguationScene(AMBIGUOUS_PERFORMERS), config);
  assert.equal(result.status, "ok");
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /Alex Rivera \(Blonde\)/);
  assert.match(result.warnings[0], /\|disambiguate/);
  // the performer with no disambiguation is nobody's problem
  assert.equal(result.warnings[0].includes("Marcus Chen"), false);
  // and it stays a warning: the rename still happens
  assert.equal(result.files[0].folder, "/data/Alex Rivera, Marcus Chen");
});

test("using |disambiguate is the fix, so it silences the warning", () => {
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "{performers|disambiguate}",
      filenamePattern: "{title}",
    },
  });
  const result = planScene(disambiguationScene(AMBIGUOUS_PERFORMERS), config);
  assert.deepEqual(result.warnings, []);
  assert.equal(
    result.files[0].folder,
    "/data/Alex Rivera (Blonde), Marcus Chen",
  );
});

test("no performer token means the ambiguity cannot reach the path", () => {
  const config = baseConfig({
    defaultPattern: { folderPattern: "{studio}", filenamePattern: "{title}" },
  });
  assert.deepEqual(
    planScene(disambiguationScene(AMBIGUOUS_PERFORMERS), config).warnings,
    [],
  );
});

// The warning follows what the token renders, not who is on the scene: a
// performer a modifier already dropped cannot collide with anyone
test("a performer filtered out of the token raises no warning", () => {
  const performers = [
    { id: "p1", name: "Alex Rivera", disambiguation: "Blonde", gender: "MALE" },
    { id: "p2", name: "Zara", gender: "FEMALE" },
  ];
  const filtered = baseConfig({
    defaultPattern: {
      folderPattern: "{performers|gender=female}",
      filenamePattern: "{title}",
    },
  });
  assert.deepEqual(
    planScene(disambiguationScene(performers), filtered).warnings,
    [],
  );

  const limited = baseConfig({
    defaultPattern: {
      folderPattern: "{performers|limit=1}",
      filenamePattern: "{title}",
    },
  });
  // sorted by name, so Alex is the one that survives limit=1 and does warn
  assert.match(
    planScene(disambiguationScene(performers), limited).warnings[0],
    /Alex Rivera \(Blonde\)/,
  );
});

test("one warning names every performer at risk, listing each once", () => {
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "{performers}",
      filenamePattern: "{performers} - {title}",
    },
  });
  const result = planScene(
    disambiguationScene([
      { id: "p1", name: "Alex Rivera", disambiguation: "Blonde" },
      { id: "p2", name: "Jo", disambiguation: "II" },
    ]),
    config,
  );
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /Alex Rivera \(Blonde\), Jo \(II\)/);
  assert.match(result.warnings[0], /renders the names alone/);
});

// Repeating a performer's bare name below a folder that already told them
// apart is harmless: the subfolder is already somewhere only they can reach
test("a disambiguated folder silences the bare names nested under it", () => {
  const config = baseConfig({
    defaultPattern: {
      folderPattern:
        "{performers|disambiguate|limit=1}/[{studio}] - {performers|limit=1}",
      filenamePattern: "{performers} - {title}",
    },
  });
  const result = planScene(disambiguationScene(AMBIGUOUS_PERFORMERS), config);
  assert.deepEqual(result.warnings, []);
  // the repeated bare name is still rendered: it is redundant, not removed
  assert.equal(
    result.files[0].folder,
    "/data/Alex Rivera (Blonde)/[Leaf Studio] - Alex Rivera",
  );
});

// and the order the tokens appear in is not the order of the nesting, so the
// disambiguating one settles the pattern wherever it sits
test("the disambiguating token can come second in the folder pattern", () => {
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "{performers|limit=1}/{performers|disambiguate|limit=1}",
      filenamePattern: "{title}",
    },
  });
  assert.deepEqual(
    planScene(disambiguationScene(AMBIGUOUS_PERFORMERS), config).warnings,
    [],
  );
});

// The filename cannot settle a folder: two performers of one name still share
// the folder, which is the thing the folder was supposed to separate
test("disambiguating only in the filename still warns about the folder", () => {
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "{performers}",
      filenamePattern: "{performers|disambiguate} - {title}",
    },
  });
  const result = planScene(disambiguationScene(AMBIGUOUS_PERFORMERS), config);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /Alex Rivera \(Blonde\)/);
});

test("a bare name in the filename is settled by the filename itself", () => {
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "{studio}",
      filenamePattern: "{performers|disambiguate} - {performers} - {title}",
    },
  });
  assert.deepEqual(
    planScene(disambiguationScene(AMBIGUOUS_PERFORMERS), config).warnings,
    [],
  );
});

// Settling is per performer, not per pattern: limit=1 disambiguates only the
// performer it renders
test("only the performers the disambiguated token renders are settled", () => {
  const config = baseConfig({
    defaultPattern: {
      folderPattern: "{performers|disambiguate|limit=1}/{performers}",
      filenamePattern: "{title}",
    },
  });
  const result = planScene(
    disambiguationScene([
      { id: "p1", name: "Alex Rivera", disambiguation: "Blonde" },
      { id: "p2", name: "Jo", disambiguation: "II" },
    ]),
    config,
  );
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /Jo \(II\)/);
  assert.equal(result.warnings[0].includes("Alex Rivera"), false);
});

// no group token in the pattern means the ambiguity cannot affect the name, so
// warning about it would be noise on every row
test("several groups warn only when the pattern actually uses one", () => {
  const config = baseConfig({
    defaultPattern: { folderPattern: "{studio}", filenamePattern: "{title}" },
  });
  const scene = Object.assign({}, normalOrganizedScene, {
    groups: [
      { scene_index: 1, group: { id: "7", name: "Teen Dreams" } },
      { scene_index: 9, group: { id: "42", name: "Later Compilation" } },
    ],
  });
  assert.deepEqual(planScene(scene, config).warnings, []);
});
