import React from "react";
import { useIntl } from "react-intl";
import { PREVIEW_SORT_FIELDS, SortDirection } from "./entity-preview-query.js";

const PluginApi = (window as any).PluginApi;
const { Dropdown, ButtonGroup, Button, OverlayTrigger, Tooltip } =
  PluginApi.libraries.Bootstrap;
const { faCaretUp, faCaretDown, faRandom } =
  PluginApi.libraries.FontAwesomeSolid;
const Icon = PluginApi.components.Icon;

interface PreviewSortSelectProps {
  field: string;
  direction: SortDirection;
  onChangeField: (field: string) => void;
  onToggleDirection: () => void;
  onReshuffle?: () => void;
  reshuffling?: boolean;
}

export function PreviewSortSelect({
  field,
  direction,
  onChangeField,
  onToggleDirection,
  onReshuffle,
  reshuffling,
}: PreviewSortSelectProps) {
  const intl = useIntl();
  const current = PREVIEW_SORT_FIELDS.find((f) => f.value === field);

  return (
    <Dropdown as={ButtonGroup} className="librarian-sort-by-select">
      <Dropdown.Toggle
        variant="secondary"
        title={intl.formatMessage({
          id: "librarian.previewSortSelect.title",
        })}
      >
        {current ? intl.formatMessage({ id: current.label }) : ""}
      </Dropdown.Toggle>
      <Dropdown.Menu popperConfig={{ strategy: "fixed" }}>
        {PREVIEW_SORT_FIELDS.map((f) => (
          <Dropdown.Item
            key={f.value}
            active={f.value === field}
            onSelect={() => onChangeField(f.value)}
          >
            {intl.formatMessage({ id: f.label })}
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
      <OverlayTrigger
        overlay={
          <Tooltip id="librarian-sort-direction-tooltip">
            {intl.formatMessage({
              id: direction === "ASC" ? "ascending" : "descending",
            })}
          </Tooltip>
        }
      >
        <Button variant="secondary" onClick={onToggleDirection}>
          <Icon icon={direction === "ASC" ? faCaretUp : faCaretDown} />
        </Button>
      </OverlayTrigger>
      {field === "random" && onReshuffle && (
        <OverlayTrigger
          overlay={
            <Tooltip id="librarian-sort-reshuffle-tooltip">
              {intl.formatMessage({
                id: "actions.reshuffle",
              })}
            </Tooltip>
          }
        >
          <Button
            variant="secondary"
            disabled={reshuffling}
            onClick={onReshuffle}
          >
            <Icon icon={faRandom} />
          </Button>
        </OverlayTrigger>
      )}
    </Dropdown>
  );
}
