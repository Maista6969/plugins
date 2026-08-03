import React, { useEffect } from "react";
import { useLibraryPaths } from "../shared/LibraryPathsContext.js";

const PluginApi = (window as any).PluginApi;
const { Form } = PluginApi.libraries.Bootstrap;

interface LibraryRootPickerProps {
  value: string;
  onChange: (next: string) => void;
  subHeading?: React.ReactNode;
}

export function LibraryRootPicker({
  value,
  onChange,
  subHeading,
}: LibraryRootPickerProps) {
  const { paths, loading } = useLibraryPaths();

  // If there's only one library we can automatically pick it
  useEffect(() => {
    if (!value && paths.length === 1) {
      onChange(paths[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, paths]);

  if (loading) {
    return <div>Loading library paths...</div>;
  }

  if (paths.length === 0) {
    return (
      <p className="librarian-token-hint text-muted">
        No library paths configured for video in Stash yet. Add one (or enable
        video for an existing one) under Settings &gt; Library first
      </p>
    );
  }

  // Don't show the select if there's no choice to be made
  if (paths.length === 1 && value === paths[0]) {
    return null;
  }

  return (
    <div className="setting">
      <div>
        <h3>Library root</h3>
        {subHeading && <div className="sub-heading">{subHeading}</div>}
      </div>
      <div>
        <Form.Control
          className="input-control"
          as="select"
          value={value}
          onChange={(e: any) => onChange(e.currentTarget.value)}
        >
          <option value="">(select a library path)</option>
          {paths.map((path) => (
            <option key={path} value={path}>
              {path}
            </option>
          ))}
        </Form.Control>
      </div>
    </div>
  );
}
