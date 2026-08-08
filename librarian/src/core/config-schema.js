export const PLUGIN_ID = "librarian";

// Settings that are not owned by any one entity type. The planner layers only
// these over a section, and the Formatting reset restores exactly these.
export const GLOBAL_SETTING_KEYS = ["delimiters", "sanitize"];

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
  if (!isPlainObject(raw)) {
    return raw;
  }

  // Sections already present: any legacy key still lying around is stale, from
  // a downgrade or a config written by an older version. Drop it rather than
  // leave it to shadow the sections.
  if (isPlainObject(raw.scenes)) {
    const cleaned = {};
    Object.keys(raw).forEach((key) => {
      if (LEGACY_SCENE_KEYS.indexOf(key) === -1) {
        cleaned[key] = raw[key];
      }
    });
    return cleaned;
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

// Restores one entity type's settings to their defaults. Rules are the user's
// own work and can represent a lot of it, so a reset disables them rather than
// discarding them: turning one back on is easy, rewriting it is not.
export function resetSection(config, entityType) {
  const defaults = DEFAULT_CONFIG[entityType];
  if (!defaults) {
    return config;
  }
  // deep copy, or the reset section would share nested objects with the defaults
  const section = JSON.parse(JSON.stringify(defaults));
  const existing = ((config && config[entityType]) || {}).rules || [];
  section.rules = existing.map((rule) => {
    return Object.assign({}, rule, { enabled: false });
  });

  const next = Object.assign({}, config);
  next[entityType] = section;
  return next;
}

// Counterpart to resetSection: restores the shared formatting settings and
// leaves every entity type, and its rules, untouched.
export function resetFormatting(config) {
  const next = Object.assign({}, config);
  GLOBAL_SETTING_KEYS.forEach((key) => {
    next[key] = JSON.parse(JSON.stringify(DEFAULT_CONFIG[key]));
  });
  return next;
}
