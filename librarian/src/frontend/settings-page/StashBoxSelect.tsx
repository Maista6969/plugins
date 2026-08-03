import React from "react";
import { useStashBoxes } from "../shared/StashBoxesContext.js";

const PluginApi = (window as any).PluginApi;
const { Form } = PluginApi.libraries.Bootstrap;

interface StashBoxSelectProps {
  value: string | undefined;
  onChange: (next: string) => void;
}

export function StashBoxSelect({ value, onChange }: StashBoxSelectProps) {
  const { stashBoxes, loading } = useStashBoxes();

  if (loading) {
    return null;
  }

  if (stashBoxes.length === 0 && !value) {
    return (
      <p className="librarian-token-hint text-muted">
        No stash-box sources configured in Stash yet. Add one under Settings
        &gt; Metadata Providers first
      </p>
    );
  }

  const current = stashBoxes.find((b) => b.endpoint === value);

  return (
    <Form.Control
      as="select"
      className="librarian-inline-select input-control"
      title="Which configured stash-box source {stash_id} resolves against"
      value={value || ""}
      onChange={(e: any) => onChange(e.target.value)}
    >
      {!value && <option value="">(none selected)</option>}
      {stashBoxes.map((box) => (
        <option key={box.endpoint} value={box.endpoint}>
          {box.name}
        </option>
      ))}
      {value && !current && (
        <option value={value} disabled>
          {value} (no longer configured in Stash)
        </option>
      )}
    </Form.Control>
  );
}
