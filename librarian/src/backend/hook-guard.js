export function filesNeedingMove(planResult) {
  if (planResult.status !== "ok") {
    return [];
  }
  return planResult.files.filter((file) => !file.unchanged);
}
