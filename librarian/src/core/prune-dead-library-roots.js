import { ENTITY_TYPES } from "./config-schema.js";

// Each entity type has its own valid roots, since Stash library paths can
// exclude video or images independently
export function pruneDeadLibraryRootsAll(config, validPathsByType) {
  const byType = validPathsByType || {};
  let next = config;
  let disabledRules = 0;
  let clearedDefault = false;

  ENTITY_TYPES.forEach((type) => {
    const section = config[type];
    if (!section) {
      return;
    }
    const result = pruneDeadLibraryRoots(section, byType[type] || []);
    if (result.config !== section) {
      const patch = {};
      patch[type] = result.config;
      next = Object.assign({}, next, patch);
    }
    disabledRules += result.disabledRules;
    clearedDefault = clearedDefault || result.clearedDefault;
  });

  return {
    config: next,
    disabledRules: disabledRules,
    clearedDefault: clearedDefault,
  };
}

// Operates on a single entity-type section
export function pruneDeadLibraryRoots(config, validPaths) {
  const valid = new Set(validPaths || []);
  let disabledRules = 0;
  let clearedDefault = false;

  const rules = (config.rules || []).map((rule) => {
    if (
      !rule.libraryRoot ||
      rule.enabled === false ||
      valid.has(rule.libraryRoot)
    ) {
      return rule;
    }
    disabledRules += 1;
    return Object.assign({}, rule, { enabled: false });
  });

  let defaultPattern = config.defaultPattern;
  if (
    defaultPattern &&
    defaultPattern.libraryRoot &&
    !valid.has(defaultPattern.libraryRoot)
  ) {
    clearedDefault = true;
    defaultPattern = Object.assign({}, defaultPattern, { libraryRoot: "" });
  }

  if (disabledRules === 0 && !clearedDefault) {
    return { config: config, disabledRules: 0, clearedDefault: false };
  }

  return {
    config: Object.assign({}, config, {
      rules: rules,
      defaultPattern: defaultPattern,
    }),
    disabledRules: disabledRules,
    clearedDefault: clearedDefault,
  };
}
