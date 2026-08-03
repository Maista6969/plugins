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
