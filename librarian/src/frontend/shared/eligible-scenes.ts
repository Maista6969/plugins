export function eligibleSceneNoun(config: any, plural?: boolean): string {
  const scenes = (config && config.scenes) || {};
  const organized = !!scenes.onlyOrganized;
  const withStashId = !!scenes.onlyWithStashId;
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
