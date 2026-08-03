export const normalOrganizedScene = {
  id: "100",
  title: "Normal Scene",
  date: "2024-05-10",
  organized: true,
  studio: {
    id: "s-leaf",
    name: "Leaf Studio",
    parent_studio: { id: "s-parent", name: "Parent Co", parent_studio: null },
  },
  performers: [{ id: "p1", name: "Amy" }],
  tags: [{ id: "t1", name: "Rock" }],
  rating100: 85,
  files: [
    {
      id: "1",
      basename: "old.mp4",
      path: "/data/old/old.mp4",
      parent_folder: { path: "/data/old" },
      width: 1920,
      height: 1080,
      video_codec: "h264",
      audio_codec: "aac",
      bit_rate: 8000000,
      fingerprints: [{ type: "phash", value: "abc123def456" }],
    },
  ],
};

export const multiFileScene = {
  id: "101",
  title: "Multi File Scene",
  date: "2024-05-11",
  organized: true,
  studio: {
    id: "s-leaf",
    name: "Leaf Studio",
    parent_studio: { id: "s-parent", name: "Parent Co", parent_studio: null },
  },
  performers: [
    { id: "p1", name: "Amy" },
    { id: "p2", name: "Zed" },
  ],
  tags: [{ id: "t2", name: "Pop" }],
  files: [
    {
      id: "20",
      basename: "b.mp4",
      path: "/data/old/b.mp4",
      parent_folder: { path: "/data/old" },
    },
    {
      id: "19",
      basename: "a.mp4",
      path: "/data/old/a.mp4",
      parent_folder: { path: "/data/old" },
    },
  ],
};

export const unorganizedScene = {
  id: "102",
  title: "Fresh Scan",
  date: "2024-05-12",
  organized: false,
  studio: { id: "s-leaf", name: "Leaf Studio", parent_studio: null },
  performers: [],
  tags: [],
  files: [
    {
      id: "30",
      basename: "new.mp4",
      path: "/data/incoming/new.mp4",
      parent_folder: { path: "/data/incoming" },
    },
  ],
};

export const noStudioScene = {
  id: "103",
  title: "No Studio Scene",
  date: "2024-05-13",
  organized: true,
  studio: null,
  performers: [],
  tags: [{ id: "t3", name: "Amateur" }],
  files: [
    {
      id: "40",
      basename: "x.mp4",
      path: "/data/old/x.mp4",
      parent_folder: { path: "/data/old" },
    },
  ],
};

export const deepStudioHierarchyScene = {
  id: "104",
  title: "Deep Hierarchy Scene",
  date: "2024-05-14",
  organized: true,
  studio: {
    id: "s-leaf2",
    name: "Leaf",
    parent_studio: {
      id: "s-level3",
      name: "Level3",
      parent_studio: {
        id: "s-level2",
        name: "Level2",
        parent_studio: {
          id: "s-networkroot",
          name: "Network Root",
          parent_studio: null,
        },
      },
    },
  },
  performers: [],
  tags: [],
  files: [
    {
      id: "50",
      basename: "y.mp4",
      path: "/data/old/y.mp4",
      parent_folder: { path: "/data/old" },
    },
  ],
};

export const slashInTagScene = {
  id: "105",
  title: "Slash Tag Scene",
  date: "2024-05-15",
  organized: true,
  studio: {
    id: "s-leaf",
    name: "Leaf Studio",
    parent_studio: { id: "s-parent", name: "Parent Co", parent_studio: null },
  },
  performers: [],
  tags: [{ id: "t4", name: "Rock/Pop" }],
  files: [
    {
      id: "60",
      basename: "z.mp4",
      path: "/data/old/z.mp4",
      parent_folder: { path: "/data/old" },
    },
  ],
};

export const multiRuleMatchScene = {
  id: "106",
  title: "Multi Rule Match",
  date: "2024-05-16",
  organized: true,
  studio: {
    id: "s-leaf",
    name: "Leaf Studio",
    parent_studio: { id: "s-parent", name: "Parent Co", parent_studio: null },
  },
  performers: [],
  tags: [
    { id: "t1", name: "Rock" },
    { id: "t2", name: "Pop" },
  ],
  files: [
    {
      id: "70",
      basename: "w.mp4",
      path: "/data/old/w.mp4",
      parent_folder: { path: "/data/old" },
    },
  ],
};

export const noRuleMatchScene = {
  id: "107",
  title: "No Rule Match",
  date: "2024-05-17",
  organized: true,
  studio: {
    id: "s-leaf",
    name: "Leaf Studio",
    parent_studio: { id: "s-parent", name: "Parent Co", parent_studio: null },
  },
  performers: [],
  tags: [],
  files: [
    {
      id: "80",
      basename: "v.mp4",
      path: "/data/old/v.mp4",
      parent_folder: { path: "/data/old" },
    },
  ],
};

export const tagMatchedButMissingStudioHierarchyScene = {
  id: "108",
  title: "Tag Matched No Hierarchy",
  date: "2024-05-18",
  organized: true,
  studio: {
    id: "s-standalone",
    name: "Standalone Studio",
    parent_studio: null,
  },
  performers: [],
  tags: [{ id: "t5", name: "SpecialTag" }],
  files: [
    {
      id: "90",
      basename: "u.mp4",
      path: "/data/old/u.mp4",
      parent_folder: { path: "/data/old" },
    },
  ],
};

export const cjkEmojiScene = {
  id: "109",
  title: "日本語タイトル 🎬",
  date: "2024-05-19",
  organized: true,
  studio: {
    id: "s-cjk-leaf",
    name: "スタジオ",
    parent_studio: { id: "s-cjk-parent", name: "親会社", parent_studio: null },
  },
  performers: [{ id: "p3", name: "パフォーマー" }],
  tags: [{ id: "t6", name: "タグ" }],
  files: [
    {
      id: "95",
      basename: "old.mp4",
      path: "/data/old/old.mp4",
      parent_folder: { path: "/data/old" },
    },
  ],
};

// For {performers_not_in_title}: "Joy" is named in the title and should be
// excluded, "Amy" is not named and should be kept
export const performerNamedInTitleScene = {
  id: "110",
  title: "A Day in the Park with Joy",
  date: "2024-05-20",
  organized: true,
  studio: { id: "s-leaf", name: "Leaf Studio", parent_studio: null },
  performers: [
    { id: "p4", name: "Joy" },
    { id: "p1", name: "Amy" },
  ],
  tags: [],
  files: [
    {
      id: "96",
      basename: "joy.mp4",
      path: "/data/old/joy.mp4",
      parent_folder: { path: "/data/old" },
    },
  ],
};
