import { adapterFor } from "../../core/entity-adapter.js";

export function eligibleEntityNoun(
  config: any,
  plural?: boolean,
  entityType: string = "scenes",
): string {
  const section = (config && config[entityType]) || {};
  const organized = !!section.onlyOrganized;
  const withStashId = !!section.onlyWithStashId;
  const adapter = adapterFor(entityType);
  const scene = plural ? adapter.plural : adapter.noun;
  if (organized && withStashId) {
    return "organized " + scene + " with a StashID";
  }
  if (organized) {
    return "organized " + scene;
  }
  if (withStashId) {
    return scene + " with a StashID";
  }
  return scene;
}
