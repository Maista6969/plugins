export const PLUGIN_ID = "librarian";

export const ENTITY_TYPES = ["scenes", "galleries", "images"];

// Config keys that lived at the top level before per-entity-type sections existed
const LEGACY_SCENE_KEYS = [
  "autoRename",
  "onlyOrganized",
  "onlyWithStashId",
  "stashIdEndpoints",
  "rules",
  "excludeConditions",
  "defaultPattern",
];

const DEFAULT_SCENES = {
  autoRename: true,
  onlyOrganized: true,
  onlyWithStashId: false,
  // which stash-box endpoints satisfy onlyWithStashId; empty means any of them
  stashIdEndpoints: [],
  rules: [],
  excludeConditions: { conditionLogic: "OR", conditions: [] },
  defaultPattern: {
    folderPattern: "{studio_hierarchy}",
    filenamePattern: "{studio} - {date} - {title}",
    sortBy: "alphabetical",
    libraryRoot: "",
    stashBoxEndpoint: "",
  },
};

const DEFAULT_GALLERIES = {
  autoRename: false,
  onlyOrganized: true,
  rules: [],
  excludeConditions: { conditionLogic: "OR", conditions: [] },
  defaultPattern: {
    folderPattern: "",
    filenamePattern: "{title}",
    sortBy: "alphabetical",
    libraryRoot: "",
  },
};

const DEFAULT_IMAGES = {
  autoRename: false,
  onlyOrganized: true,
  rules: [],
  excludeConditions: { conditionLogic: "OR", conditions: [] },
  defaultPattern: {
    folderPattern: "",
    filenamePattern: "{title}",
    sortBy: "alphabetical",
    libraryRoot: "",
  },
};

export const DEFAULT_CONFIG = {
  scenes: DEFAULT_SCENES,
  galleries: DEFAULT_GALLERIES,
  images: DEFAULT_IMAGES,
  delimiters: { performers: ", ", tags: ", " },
  sanitize: {
    maxSegmentLength: 255,
    spaceReplacement: "",
  },
};

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function migrateLegacyConfig(raw) {
  if (!isPlainObject(raw) || isPlainObject(raw.scenes)) {
    return raw;
  }

  const legacyKeys = LEGACY_SCENE_KEYS.filter((key) => {
    return Object.prototype.hasOwnProperty.call(raw, key);
  });
  if (legacyKeys.length === 0) {
    return raw;
  }

  const migrated = {};
  Object.keys(raw).forEach((key) => {
    if (LEGACY_SCENE_KEYS.indexOf(key) === -1) {
      migrated[key] = raw[key];
    }
  });
  migrated.scenes = {};
  legacyKeys.forEach((key) => {
    migrated.scenes[key] = raw[key];
  });
  return migrated;
}

export function normalizeConfig(raw) {
  return mergeDefaults(
    DEFAULT_CONFIG,
    migrateLegacyConfig(isPlainObject(raw) ? raw : {}),
  );
}

function mergeDefaults(defaults, raw) {
  if (Array.isArray(defaults)) {
    return Array.isArray(raw) ? raw : defaults.slice();
  }
  if (isPlainObject(defaults)) {
    const rawObj = isPlainObject(raw) ? raw : {};
    const result = {};
    const keys = new Set(Object.keys(defaults).concat(Object.keys(rawObj)));
    keys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(defaults, key)) {
        result[key] = mergeDefaults(defaults[key], rawObj[key]);
      } else {
        result[key] = rawObj[key];
      }
    });
    return result;
  }
  return raw === undefined ? defaults : raw;
}
