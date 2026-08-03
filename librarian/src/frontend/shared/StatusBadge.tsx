import React from "react";

const LABELS: Record<string, string> = {
  "will-move": "Will move",
  unchanged: "Unchanged",
  skipped: "Skipped",
  error: "Error",
  pending: "Renaming...",
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
  const label = LABELS[status] || status;
  const variant = "badge " + (BADGE_VARIANTS[status] || "badge-secondary");
  if (onClick && status === "will-move") {
    const combinedTitle = title
      ? title + " (click to rename this scene now)"
      : "Rename this scene now";
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
