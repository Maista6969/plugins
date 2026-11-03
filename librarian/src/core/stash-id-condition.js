// An empty endpoint list means any stash-box at all, the same as the
// "Only rename scenes with at least one StashID" gate's accepted sources
export function stashIdEndpoints(value) {
  return (Array.isArray(value) ? value : []).filter((endpoint) => {
    return !!endpoint;
  });
}

export function hasStashIdFrom(sceneView, endpoints) {
  const wanted = stashIdEndpoints(endpoints);
  return (sceneView.stashIds || []).some((s) => {
    return wanted.length === 0 || wanted.indexOf(s.endpoint) !== -1;
  });
}

export function evaluateStashIdCondition(sceneView, condition) {
  const has = hasStashIdFrom(sceneView, condition.value);
  return condition.op === "is_null" ? !has : has;
}

// Endpoints are what is stored, so a source renamed in Stash keeps matching,
// but people know their stash-boxes by name
function sourceName(endpoint, stashBoxes) {
  const box = (stashBoxes || []).find((b) => {
    return b.endpoint === endpoint;
  });
  return box && box.name ? box.name : endpoint;
}

export function describeStashIdCondition(sceneView, condition, stashBoxes) {
  const wanted = stashIdEndpoints(condition.value);
  if (condition.op === "is_null") {
    if (wanted.length === 0) {
      return "has no StashID";
    }
    return (
      "has no StashID from " +
      wanted
        .map((endpoint) => {
          return sourceName(endpoint, stashBoxes);
        })
        .join(" or ")
    );
  }
  // names the source(s) the scene actually has, like the other conditions
  // name whoever satisfied them
  const held = [];
  (sceneView.stashIds || []).forEach((s) => {
    if (
      (wanted.length === 0 || wanted.indexOf(s.endpoint) !== -1) &&
      held.indexOf(s.endpoint) === -1
    ) {
      held.push(s.endpoint);
    }
  });
  return held.length === 0
    ? "has a StashID"
    : "has a StashID from " +
        held
          .map((endpoint) => {
            return sourceName(endpoint, stashBoxes);
          })
          .join(", ");
}
