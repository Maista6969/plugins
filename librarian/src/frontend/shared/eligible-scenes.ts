export function eligibleSceneNoun(config: any, plural?: boolean): string {
  const organized = !!(config && config.onlyOrganized);
  const withStashId = !!(config && config.onlyWithStashId);
  const scene = plural ? "scenes" : "scene";
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
