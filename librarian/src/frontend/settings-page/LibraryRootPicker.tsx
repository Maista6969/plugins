import React, { useEffect } from "react";
import { useIntl } from "react-intl";
import { useLibraryPaths } from "../shared/LibraryPathsContext.js";

const PluginApi = (window as any).PluginApi;
const { Form } = PluginApi.libraries.Bootstrap;

interface LibraryRootPickerProps {
  value: string;
  onChange: (next: string) => void;
  subHeading?: React.ReactNode;
  entityType?: string;
}

export function LibraryRootPicker({
  value,
  onChange,
  subHeading,
  entityType,
}: LibraryRootPickerProps) {
  const intl = useIntl();
  const { pathsByType, loading } = useLibraryPaths();
  // A Stash library path can exclude video or images independently, so a
  // video-only library is not a valid destination for galleries or images
  const paths =
    (pathsByType as any)[entityType || "scenes"] || pathsByType.scenes;

  // If there's only one library we can automatically pick it
  useEffect(() => {
    if (!value && paths.length === 1) {
      onChange(paths[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, paths]);

  if (loading) {
    return (
      <div>
        {intl.formatMessage({ id: "librarian.libraryRootPicker.loading" })}
      </div>
    );
  }

  if (paths.length === 0) {
    const mediaKind = intl.formatMessage({
      id:
        entityType === "scenes" || !entityType
          ? "librarian.libraryRootPicker.video"
          : "librarian.libraryRootPicker.images",
    });
    return (
      <p className="librarian-token-hint text-muted">
        {intl.formatMessage(
          { id: "librarian.libraryRootPicker.noPaths" },
          { mediaKind },
        )}
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
        <h3>
          {intl.formatMessage({ id: "librarian.libraryRootPicker.heading" })}
        </h3>
        {subHeading && <div className="sub-heading">{subHeading}</div>}
      </div>
      <div>
        <Form.Control
          className="input-control"
          as="select"
          value={value}
          onChange={(e: any) => onChange(e.currentTarget.value)}
        >
          <option value="">
            {intl.formatMessage({
              id: "librarian.libraryRootPicker.selectPath",
            })}
          </option>
          {paths.map((path: string) => (
            <option key={path} value={path}>
              {path}
            </option>
          ))}
        </Form.Control>
      </div>
    </div>
  );
}
