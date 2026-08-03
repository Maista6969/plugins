const PluginApi = (window as any).PluginApi;

const LOADABLE_KEY_BY_ENTITY: Record<string, string> = {
  performer: "PerformerSelect",
  tag: "Tags",
  studio: "Studios",
};

export function useLoadSelectComponents(entities: string[]): boolean {
  const loadable = entities
    .map((entity) => LOADABLE_KEY_BY_ENTITY[entity])
    .map((key) => key && PluginApi?.loadableComponents?.[key])
    .filter(Boolean);
  return PluginApi.hooks.useLoadComponents(loadable);
}
