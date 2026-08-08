import React from "react";
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

// sorting by name is not a choice, we need it for non-determinism
const CHOICES = [
  { value: "favorite", label: "Favourites first" },
  {
    value: "rating",
    label: "Highest rated",
    title: "Unrated performers go last",
  },
];

export function SortCriteriaSelect({
  value,
  onChange,
}: SortCriteriaSelectProps) {
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
              title={choice.title}
              onClick={() => toggle(choice.value)}
            >
              {rank !== -1 && (
                <span className="librarian-sort-rank">{rank + 1}</span>
              )}
              {choice.label}
            </Button>
          );
        })}
      </ButtonGroup>
      <span className="librarian-sort-tiebreak text-muted">then A→Z</span>
      <div className="librarian-token-hint text-muted">
        {describeSortCriteria(value)}
      </div>
    </>
  );
}
