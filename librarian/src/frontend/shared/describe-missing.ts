import { StashBoxSummary } from "./stash-api.js";

// We can show the display name in the UI but the
// backend will fall back to just the endpoint URL
export function describeMissingData(
  missing: any[],
  stashBoxes: StashBoxSummary[],
): string {
  return (missing || [])
    .map((m) => {
      if (!m.endpoint) {
        return m.message;
      }
      const box = (stashBoxes || []).find((b) => b.endpoint === m.endpoint);
      return box ? m.message.replace(m.endpoint, box.name) : m.message;
    })
    .join(", ");
}
