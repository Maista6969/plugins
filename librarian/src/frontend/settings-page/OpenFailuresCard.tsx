import React, { useState } from "react";
import { useIntl } from "react-intl";
import { useOpenFailures } from "../shared/OpenFailuresContext.js";
import { FailuresModal } from "../shared/RunResultStatus.js";
import { countableNoun } from "../shared/eligible-entities.js";

const PluginApi = (window as any).PluginApi;
const { Button, Card } = PluginApi.libraries.Bootstrap;
const { faExclamationTriangle } = PluginApi.libraries.FontAwesomeSolid;
const Icon = PluginApi.components.Icon;

// One row however long the list gets: the list itself opens in a modal.
// Only shown while something is open, so with nothing to fix the page stays as it was
export function OpenFailuresCard({ entityType }: { entityType: string }) {
  const intl = useIntl();
  const { list, clear } = useOpenFailures(entityType);
  const [showing, setShowing] = useState(false);
  const [clearing, setClearing] = useState(false);

  if (list.length === 0) {
    return null;
  }

  async function handleClear() {
    setClearing(true);
    try {
      await clear();
      setShowing(false);
    } finally {
      setClearing(false);
    }
  }

  const heading = intl.formatMessage(
    { id: "librarian.openFailures.heading" },
    {
      count: list.length,
      entityNoun: countableNoun(intl, entityType, list.length !== 1),
    },
  );

  return (
    <div className="setting-section">
      <Card>
        <div className="setting">
          <div>
            <h3>
              <Icon
                icon={faExclamationTriangle}
                className="text-warning ml-0"
              />
              {heading}
            </h3>
          </div>
          <div>
            <Button variant="secondary" onClick={() => setShowing(true)}>
              {intl.formatMessage({ id: "details" })}
            </Button>
            <Button
              variant="secondary"
              disabled={clearing}
              onClick={handleClear}
              className="ml-2"
            >
              {intl.formatMessage({ id: "actions.clear" })}
            </Button>
          </div>
          {showing && (
            <FailuresModal
              header={heading}
              failures={list}
              entityType={entityType}
              showWhen
              onClear={handleClear}
              clearing={clearing}
              onHide={() => setShowing(false)}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
