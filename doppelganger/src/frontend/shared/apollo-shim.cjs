// Stash's own Apollo Client/React bindings, shared with the host app so our
// components read from the same cache/context instead of a bundled duplicate.
module.exports = window.PluginApi.libraries.Apollo;
