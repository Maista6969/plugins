import { IntlShape } from "react-intl";
import { StashBoxSummary } from "./stash-api.js";
import { codedMessage, nounValues } from "./coded-message.js";

// We can show the display name in the UI but the
// backend will fall back to just the endpoint URL
export function describeMissingData(
  intl: IntlShape,
  missing: any[],
  stashBoxes: StashBoxSummary[],
  entityType?: string,
): string {
  const nouns = nounValues(intl, entityType);
  return (missing || [])
    .map((m) => {
      const box = m.endpoint
        ? (stashBoxes || []).find((b) => b.endpoint === m.endpoint)
        : null;
      const values = { ...(m.values || {}), ...nouns };
      if (box) {
        values.source = box.name;
      }
      const fallback = box
        ? m.message.replace(m.endpoint, box.name)
        : m.message;
      return codedMessage(
        intl,
        "librarian.missingData",
        m.code,
        values,
        fallback,
      );
    })
    .join(", ");
}
