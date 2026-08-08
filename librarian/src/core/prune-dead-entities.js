import { ENTITY_TYPES } from "./config-schema.js";

function fieldEntityType(field) {
  if (field === "studio") return "studio";
  if (field === "performer") return "performer";
  if (field === "tag") return "tag";
  return null;
}

const ID_TYPES = ["performer", "tag", "studio"];

export function collectEntityIdsAll(config) {
  const ids = { performer: new Set(), tag: new Set(), studio: new Set() };
  ENTITY_TYPES.forEach((type) => {
    const section = config[type];
    if (!section) {
      return;
    }
    const sectionIds = collectEntityIds(section);
    ID_TYPES.forEach((idType) => {
      sectionIds[idType].forEach((id) => {
        ids[idType].add(id);
      });
    });
  });
  return ids;
}

export function pruneDeadEntitiesAll(config, deadIds) {
  let next = config;
  let removedReferences = 0;
  let removedRules = 0;

  ENTITY_TYPES.forEach((type) => {
    const section = config[type];
    if (!section) {
      return;
    }
    const result = pruneDeadEntities(section, deadIds);
    if (result.config !== section) {
      const patch = {};
      patch[type] = result.config;
      next = Object.assign({}, next, patch);
    }
    removedReferences += result.removedReferences;
    removedRules += result.removedRules;
  });

  return {
    config: next,
    removedReferences: removedReferences,
    removedRules: removedRules,
  };
}

// Operates on a single entity-type section
export function collectEntityIds(config) {
  const ids = { performer: new Set(), tag: new Set(), studio: new Set() };

  function visit(conditions) {
    (conditions || []).forEach((c) => {
      const type = fieldEntityType(c.field);
      if (type && Array.isArray(c.value)) {
        c.value.forEach((id) => {
          ids[type].add(String(id));
        });
      }
    });
  }

  (config.rules || []).forEach((rule) => {
    visit(rule.conditions);
  });
  if (config.excludeConditions) {
    visit(config.excludeConditions.conditions);
  }

  return ids;
}

function pruneConditionList(conditions, deadIds, counters) {
  const next = [];
  (conditions || []).forEach((c) => {
    const type = fieldEntityType(c.field);
    if (!type || !Array.isArray(c.value)) {
      next.push(c);
      return;
    }
    const dead = deadIds[type];
    const filtered = c.value.filter((id) => {
      return !dead.has(String(id));
    });
    if (filtered.length === c.value.length) {
      next.push(c);
      return;
    }
    counters.removedReferences += c.value.length - filtered.length;
    if (filtered.length > 0) {
      next.push(Object.assign({}, c, { value: filtered }));
    }
  });
  return next;
}

export function pruneDeadEntities(config, deadIds) {
  const counters = { removedReferences: 0, removedRules: 0 };

  const rules = [];
  (config.rules || []).forEach((rule) => {
    const hadConditions = (rule.conditions || []).length > 0;
    const before = counters.removedReferences;
    const nextConditions = pruneConditionList(
      rule.conditions,
      deadIds,
      counters,
    );
    const listChanged = counters.removedReferences !== before;
    if (hadConditions && nextConditions.length === 0) {
      counters.removedRules += 1;
      return;
    }
    rules.push(
      listChanged
        ? Object.assign({}, rule, { conditions: nextConditions })
        : rule,
    );
  });

  const excludeBefore = counters.removedReferences;
  const prunedExcludeConditions = config.excludeConditions
    ? pruneConditionList(config.excludeConditions.conditions, deadIds, counters)
    : undefined;
  const excludeChanged = counters.removedReferences !== excludeBefore;
  const excludeConditions =
    config.excludeConditions && excludeChanged
      ? Object.assign({}, config.excludeConditions, {
          conditions: prunedExcludeConditions,
        })
      : config.excludeConditions;

  if (counters.removedReferences === 0 && counters.removedRules === 0) {
    return { config: config, removedReferences: 0, removedRules: 0 };
  }

  return {
    config: Object.assign({}, config, {
      rules: rules,
      excludeConditions: excludeConditions,
    }),
    removedReferences: counters.removedReferences,
    removedRules: counters.removedRules,
  };
}
