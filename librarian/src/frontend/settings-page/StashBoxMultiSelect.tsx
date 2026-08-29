import React from "react";
import { useIntl } from "react-intl";
import { useStashBoxes } from "../shared/StashBoxesContext.js";

const PluginApi = (window as any).PluginApi;
const ReactSelectLib = PluginApi.libraries.ReactSelect;
const ReactSelect = ReactSelectLib.default || ReactSelectLib;

interface Option {
  value: string;
  label: string;
}

const SELECT_COMPONENTS = { IndicatorSeparator: () => null };

const SELECT_STYLES = {
  multiValueRemove: (base: any, state: any) => ({
    ...base,
    color: state.isFocused ? base.color : "#333333",
  }),
};

interface StashBoxMultiSelectProps {
  value: string[] | undefined;
  onChange: (next: string[]) => void;
}

export function StashBoxMultiSelect({
  value,
  onChange,
}: StashBoxMultiSelectProps) {
  const intl = useIntl();
  const { stashBoxes, loading } = useStashBoxes();
  const selected = value || [];

  if (loading) {
    return null;
  }

  const options: Option[] = stashBoxes.map((box) => ({
    value: box.endpoint,
    label: box.name,
  }));

  // A source can be removed from Stash after being selected here
  const orphaned: Option[] = selected
    .filter((endpoint) => !stashBoxes.some((b) => b.endpoint === endpoint))
    .map((endpoint) => ({
      value: endpoint,
      label: intl.formatMessage(
        { id: "librarian.stashBoxSelect.noLongerConfigured" },
        { value: endpoint },
      ),
    }));

  const all = options.concat(orphaned);

  return (
    <div className="librarian-stash-box-multiselect">
      <ReactSelect
        isMulti
        classNamePrefix="react-select"
        components={SELECT_COMPONENTS}
        styles={SELECT_STYLES}
        menuPortalTarget={
          typeof document === "undefined" ? null : document.body
        }
        placeholder={intl.formatMessage({
          id: "librarian.stashBoxMultiSelect.placeholder",
        })}
        options={all}
        value={all.filter((o) => selected.indexOf(o.value) !== -1)}
        onChange={(next: Option[] | null) =>
          onChange((next || []).map((o) => o.value))
        }
      />
    </div>
  );
}
