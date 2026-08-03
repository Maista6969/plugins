export const PLUGIN_ID = "librarian";

export const DEFAULT_CONFIG = {
  autoRename: true,
  onlyOrganized: true,
  onlyWithStashId: false,
  rules: [],
  excludeConditions: { conditionLogic: "OR", conditions: [] },
  defaultPattern: {
    folderPattern: "{studio_hierarchy}",
    filenamePattern: "{studio} - {date} - {title}",
    sortBy: "alphabetical",
    libraryRoot: "",
    stashBoxEndpoint: "",
  },
  delimiters: { performers: ", ", tags: ", " },
  sanitize: {
    maxSegmentLength: 255,
    spaceReplacement: "",
  },
};

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeConfig(raw) {
  return mergeDefaults(DEFAULT_CONFIG, isPlainObject(raw) ? raw : {});
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
