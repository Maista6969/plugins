import React from "react";
import { useIntl } from "react-intl";

// values are message ids, resolved at render time since this is a
// module-level constant built before any component (and its useIntl())
// exists.
const LABELS: Record<string, string> = {
  "will-move": "librarian.statusBadge.willMove",
  unchanged: "librarian.statusBadge.unchanged",
  skipped: "librarian.statusBadge.skipped",
  error: "librarian.statusBadge.error",
  pending: "librarian.statusBadge.pending",
};

const BADGE_VARIANTS: Record<string, string> = {
  pending: "badge-primary",
  "will-move": "badge-success",
  unchanged: "badge-secondary",
  skipped: "badge-warning",
  error: "badge-danger",
};

interface StatusBadgeProps {
  status: string;
  onClick?: () => void;
  title?: string;
}

export function StatusBadge({ status, onClick, title }: StatusBadgeProps) {
  const intl = useIntl();
  const label = LABELS[status]
    ? intl.formatMessage({ id: LABELS[status] })
    : status;
  const variant = "badge " + (BADGE_VARIANTS[status] || "badge-secondary");
  if (onClick && status === "will-move") {
    const combinedTitle = title
      ? intl.formatMessage(
          { id: "librarian.statusBadge.clickToRenameSuffixed" },
          { title },
        )
      : intl.formatMessage({ id: "librarian.statusBadge.renameNow" });
    return (
      <button
        type="button"
        className={"librarian-status-badge clickable " + status + " " + variant}
        onClick={onClick}
        title={combinedTitle}
      >
        {label}
      </button>
    );
  }
  return (
    <span
      className={"librarian-status-badge " + status + " " + variant}
      title={title}
    >
      {label}
    </span>
  );
}
