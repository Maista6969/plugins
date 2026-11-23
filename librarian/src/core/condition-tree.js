// A condition list item is a leaf ({field, op, value}) or a group holding its
// own list, shaped like a rule ({conditionLogic, conditions})
export function isConditionGroup(condition) {
  return !!condition && Array.isArray(condition.conditions);
}

export function leafConditions(conditions) {
  const leaves = [];
  (conditions || []).forEach((condition) => {
    if (isConditionGroup(condition)) {
      leaves.push.apply(leaves, leafConditions(condition.conditions));
    } else if (condition) {
      leaves.push(condition);
    }
  });
  return leaves;
}
