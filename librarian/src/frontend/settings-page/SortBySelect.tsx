import React from "react";

const PluginApi = (window as any).PluginApi;
const { Form } = PluginApi.libraries.Bootstrap;

interface SortBySelectProps {
  value: string | undefined;
  onChange: (next: string) => void;
}

const OPTIONS = [
  { value: "alphabetical", label: "alphabetically" },
  { value: "favorite_first", label: "favorites first" },
  { value: "rating", label: "by rating" },
];

export function SortBySelect({ value, onChange }: SortBySelectProps) {
  return (
    <Form.Control
      as="select"
      className="librarian-inline-select input-control"
      title="Order of {performers}/{performers_not_in_title} for this pattern"
      value={value || "alphabetical"}
      onChange={(e: any) => onChange(e.target.value)}
    >
      {OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </Form.Control>
  );
}
