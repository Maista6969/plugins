import { ENTITY_ADAPTERS } from "../../core/entity-adapter.js";

export interface EntityNounIntl {
  formatMessage(
    descriptor: { id: string },
    values?: Record<string, unknown>,
  ): string;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Stash's own locale files already carry "countables.scenes" etc. (see
// src/locales/en-GB.json), so reuse those instead of a Librarian-only noun.
// Stash's own value is capitalized (it's written for standalone labels like
// tab names), but nearly every caller here splices it mid-sentence, so this
// lowercases by default; pass capitalized: true for the rare label/heading
// use that wants it back.
export function countableNoun(
  intl: EntityNounIntl,
  entityType: string,
  plural: boolean = true,
  capitalized: boolean = false,
): string {
  const canonicalType = (ENTITY_ADAPTERS as Record<string, unknown>)[entityType]
    ? entityType
    : "scenes";
  const noun = intl.formatMessage(
    { id: `countables.${canonicalType}` },
    { count: plural ? 2 : 1 },
  );
  return capitalized ? noun : noun.toLowerCase();
}

export function eligibleEntityNoun(
  intl: EntityNounIntl,
  config: any,
  plural?: boolean,
  entityType: string = "scenes",
): string {
  const section = (config && config[entityType]) || {};
  const organized = !!section.onlyOrganized;
  const withStashId = !!section.onlyWithStashId;
  const scene = countableNoun(intl, entityType, plural);
  const organizedWord = intl.formatMessage({ id: "organized" }).toLowerCase();
  const withStashIdSuffix = intl.formatMessage({
    id: "librarian.eligibleEntityNoun.withStashId",
  });
  if (organized && withStashId) {
    return organizedWord + " " + scene + withStashIdSuffix;
  }
  if (organized) {
    return organizedWord + " " + scene;
  }
  if (withStashId) {
    return scene + withStashIdSuffix;
  }
  return scene;
}
