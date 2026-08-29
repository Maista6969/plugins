import React from "react";
import { useIntl } from "react-intl";
import {
  defaultPatternCriteria,
  criteriaGaps,
} from "../../core/pattern-to-criteria.js";
import { entitySettings } from "../../core/plan-scene.js";

const GAP_MESSAGE_IDS: Record<string, string> = {
  exclusions: "librarian.renamableFilterButton.gap.exclusions",
  claimed_by_rule: "librarian.renamableFilterButton.gap.claimedByRule",
};

const PluginApi = (window as any).PluginApi;
const { Button, OverlayTrigger, Tooltip } = PluginApi.libraries.Bootstrap;
// Stash runs react-router 5, where navigation is useHistory; the repo types are
// v6, so this comes off the library object rather than the typed import
const { useHistory } = PluginApi.libraries.ReactRouterDOM;

// Narrows the Scenes page to what Librarian can actually rename, so a new user
// does not meet a page of "Skipped" rows.
//
// It goes through Stash's own ListFilterModel rather than querying ourselves:
// clone the live filter, add criteria via the public makeCriterion(), and push
// the model's own makeQueryParameters() output. Stash then parses the URL back,
// so the filter lands in the address bar and in the list exactly as if it had
// been built by hand -- which is the only way it survives a reload or a share.
//
// The criteria are a flat AND, because that is all a URL filter can be, so this
// removes the common causes of a skip and not every cause. criteriaGaps names
// what is left over instead of letting the button imply more than it does.
function applyCriteria(filter: any, criteria: any[]): any | null {
  const next = filter.clone();
  criteria.forEach((spec) => {
    let criterion;
    try {
      criterion = next.makeCriterion(spec.type);
    } catch (e) {
      // a Stash version without this criterion: a less precise filter beats
      // throwing in a click handler
      return;
    }
    if (!criterion || criterion.criterionOption.type !== spec.type) {
      return;
    }
    if (spec.modifier) {
      const allowed = criterion.criterionOption.modifierOptions || [];
      if (allowed.length > 0 && allowed.indexOf(spec.modifier) === -1) {
        return;
      }
      criterion.modifier = spec.modifier;
    }
    if (spec.value !== undefined) {
      criterion.value = spec.value;
    }
    // one criterion per type is what the list itself enforces
    next.criteria = next.criteria.filter(
      (c: any) => c.criterionOption.type !== spec.type,
    );
    next.criteria.push(criterion);
  });
  return next.criteria.length > 0 ? next : null;
}

interface RenamableFilterButtonProps {
  config: any;
  liveFilter: any;
}

export function RenamableFilterButton({
  config,
  liveFilter,
}: RenamableFilterButtonProps) {
  const intl = useIntl();
  const history = useHistory();
  if (!config || !liveFilter) {
    return null;
  }

  const settings = entitySettings(config, "scenes");
  const criteria = defaultPatternCriteria(settings);
  const gaps = criteriaGaps(settings).map((key) =>
    intl.formatMessage({ id: GAP_MESSAGE_IDS[key] || key }),
  );

  function apply() {
    const next = applyCriteria(liveFilter, criteria);
    if (!next) {
      return;
    }
    // page 1: the old page number rarely exists in a smaller result set
    next.currentPage = 1;
    history.push(`/scenes?${next.makeQueryParameters()}`);
  }

  const tooltip = (
    <Tooltip id="librarian-renamable-filter">
      <div>
        {intl.formatMessage({
          id: "librarian.renamableFilterButton.tooltip",
        })}
      </div>
      {gaps.length > 0 && (
        <div className="mt-1">
          {intl.formatMessage(
            { id: "librarian.renamableFilterButton.gapsHint" },
            {
              gaps: gaps.join(
                intl.formatMessage({ id: "librarian.common.or" }),
              ),
            },
          )}
        </div>
      )}
    </Tooltip>
  );

  return (
    <OverlayTrigger placement="bottom" overlay={tooltip}>
      <Button variant="secondary" onClick={apply}>
        {intl.formatMessage({ id: "librarian.renamableFilterButton.show" })}
      </Button>
    </OverlayTrigger>
  );
}
