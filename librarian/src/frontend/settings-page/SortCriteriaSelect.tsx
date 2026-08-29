import React from "react";
import { useIntl } from "react-intl";
import {
  normalizeSortCriteria,
  describeSortCriteria,
} from "../../core/entity-sort.js";

const PluginApi = (window as any).PluginApi;
const { Button, ButtonGroup } = PluginApi.libraries.Bootstrap;

interface SortCriteriaSelectProps {
  value: string[] | string | undefined;
  onChange: (next: string[]) => void;
}

// sorting by name is not a choice, we need it for non-determinism. label/title
// are message ids, resolved at render time since this is a module-level
// constant built before any component (and its useIntl()) exists.
const CHOICES = [
  {
    value: "favorite",
    label: "librarian.sortCriteriaSelect.favoritesFirst.label",
  },
  {
    value: "rating",
    label: "librarian.sortCriteriaSelect.highestRated.label",
    title: "librarian.sortCriteriaSelect.highestRated.title",
  },
];

export function SortCriteriaSelect({
  value,
  onChange,
}: SortCriteriaSelectProps) {
  const intl = useIntl();
  // normalize appends "name"; the buttons only ever deal with the rest
  const selected = normalizeSortCriteria(value).filter((c) => c !== "name");

  function toggle(criterion: string) {
    const next = selected.includes(criterion)
      ? selected.filter((c) => c !== criterion)
      : selected.concat(criterion);
    onChange(next.concat("name"));
  }

  return (
    <>
      <ButtonGroup size="sm" className="librarian-sort-criteria">
        {CHOICES.map((choice) => {
          const rank = selected.indexOf(choice.value);
          return (
            <Button
              key={choice.value}
              variant={rank === -1 ? "secondary" : "primary"}
              title={
                choice.title
                  ? intl.formatMessage({ id: choice.title })
                  : undefined
              }
              onClick={() => toggle(choice.value)}
            >
              {rank !== -1 && (
                <span className="librarian-sort-rank">{rank + 1}</span>
              )}
              {intl.formatMessage({ id: choice.label })}
            </Button>
          );
        })}
      </ButtonGroup>
      <span className="librarian-sort-tiebreak text-muted">
        {intl.formatMessage({ id: "librarian.sortCriteriaSelect.tiebreak" })}
      </span>
      <div className="librarian-token-hint text-muted">
        {describeSortCriteria(intl, value)}
      </div>
    </>
  );
}
