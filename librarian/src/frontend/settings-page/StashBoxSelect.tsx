import React from "react";
import { useIntl, IntlShape } from "react-intl";
import { useStashBoxes } from "../shared/StashBoxesContext.js";

const PluginApi = (window as any).PluginApi;
const { Form } = PluginApi.libraries.Bootstrap;

interface StashBoxSelectProps {
  value: string | undefined;
  onChange: (next: string) => void;
  inheritedEndpoint?: string;
}

function inheritedPlaceholder(
  intl: IntlShape,
  stashBoxes: { name: string; endpoint: string }[],
  inheritedEndpoint?: string,
): string {
  if (!inheritedEndpoint) {
    return intl.formatMessage({ id: "librarian.stashBoxSelect.noneSelected" });
  }
  const box = stashBoxes.find((b) => b.endpoint === inheritedEndpoint);
  return intl.formatMessage(
    { id: "librarian.stashBoxSelect.inheritedSource" },
    { source: box ? box.name : inheritedEndpoint },
  );
}

export function StashBoxSelect({
  value,
  onChange,
  inheritedEndpoint,
}: StashBoxSelectProps) {
  const intl = useIntl();
  const { stashBoxes, loading } = useStashBoxes();

  if (loading) {
    return null;
  }

  if (stashBoxes.length === 0 && !value) {
    return (
      <p className="librarian-token-hint text-muted">
        {intl.formatMessage({ id: "librarian.stashBoxSelect.noneConfigured" })}
      </p>
    );
  }

  const current = stashBoxes.find((b) => b.endpoint === value);

  return (
    <Form.Control
      as="select"
      className="librarian-inline-select input-control"
      title={intl.formatMessage({ id: "librarian.stashBoxSelect.title" })}
      value={value || ""}
      onChange={(e: any) => onChange(e.target.value)}
    >
      {!value && (
        <option value="">
          {inheritedPlaceholder(intl, stashBoxes, inheritedEndpoint)}
        </option>
      )}
      {stashBoxes.map((box) => (
        <option key={box.endpoint} value={box.endpoint}>
          {box.name}
        </option>
      ))}
      {value && !current && (
        <option value={value} disabled>
          {intl.formatMessage(
            { id: "librarian.stashBoxSelect.noLongerConfigured" },
            { value },
          )}
        </option>
      )}
    </Form.Control>
  );
}
