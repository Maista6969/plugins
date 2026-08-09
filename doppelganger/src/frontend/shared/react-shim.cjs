// The host app (Stash) already has one React instance loaded and wired to its
// own Apollo/Router context. Bundling a second copy from node_modules would
// break hooks/context silently (two React copies = invalid hook call), so
// esbuild aliases "react" to this file instead of a real dependency.
module.exports = window.PluginApi.React;
