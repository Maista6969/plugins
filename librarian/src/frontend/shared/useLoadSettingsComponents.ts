const PluginApi = (window as any).PluginApi;

export function useLoadSettingsComponents(): boolean {
  const loadable = [PluginApi?.loadableComponents?.Settings].filter(Boolean);
  return PluginApi.hooks.useLoadComponents(loadable);
}
