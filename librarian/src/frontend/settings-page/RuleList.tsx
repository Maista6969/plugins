import React, { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { RuleEditor, Rule } from "./RuleEditor.js";

const PluginApi = (window as any).PluginApi;
const { Button, ListGroup } = PluginApi.libraries.Bootstrap;

let nextRuleSeq = 1;
function newRuleId(): string {
  return "rule-" + Date.now() + "-" + nextRuleSeq++;
}

function newRule(existingRules: Rule[]): Rule {
  return {
    id: newRuleId(),
    // Stored in config and pattern-matched by PluginSettingsSummary's
    // UNNAMED_RULE_RE, so this must stay a fixed English string, not a
    // translated one, regardless of the active locale.
    name: "Unnamed rule " + (existingRules.length + 1),
    enabled: true,
    conditionLogic: "AND",
    conditions: [{ field: "tag", op: "any_of", value: [] }],
    folderPattern: "",
    filenamePattern: "",
    sortBy: ["name"],
    // Intentionally left blank
    // LibraryRootPicker auto-fills if exactly one library is configured
    libraryRoot: "",
  };
}

interface RuleListProps {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  config: any;
  entityType?: string;
}

// Visually modelled after the source list in Stash's Identify modal dialog
export function RuleList({
  rules,
  onChange,
  config,
  entityType,
}: RuleListProps) {
  const intl = useIntl();
  const [tempRules, setTempRules] = useState(rules);
  const [dragIndex, setDragIndex] = useState<number | undefined>();
  const [mouseOverIndex, setMouseOverIndex] = useState<number | undefined>();
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  useEffect(() => {
    setTempRules([...rules]);
  }, [rules]);

  function updateAt(index: number, next: Rule) {
    const copy = rules.slice();
    copy[index] = next;
    onChange(copy);
  }
  function removeAt(index: number) {
    const copy = rules.slice();
    copy.splice(index, 1);
    onChange(copy);
  }

  function onItemDragStart(event: React.DragEvent<HTMLElement>, index: number) {
    event.dataTransfer.effectAllowed = "move";
    setDragIndex(index);
  }

  function onItemDragEnter(event: React.DragEvent<HTMLElement>, index: number) {
    if (dragIndex !== undefined && index !== dragIndex) {
      const next = tempRules.slice();
      const moved = next.splice(dragIndex, 1);
      next.splice(index, 0, moved[0]);
      setTempRules(next);
      setDragIndex(index);
    }
    event.dataTransfer.dropEffect = "move";
    event.preventDefault();
  }

  function onContainerDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.dataTransfer.dropEffect = "move";
    event.preventDefault();
  }

  function onItemDrop() {
    onChange(tempRules);
    setDragIndex(undefined);
    setMouseOverIndex(undefined);
  }

  function addRule() {
    const rule = newRule(rules);
    onChange([...rules, rule]);
    setJustAddedId(rule.id);
  }

  return (
    <div className="librarian-rule-list-wrapper">
      <p className="librarian-token-hint text-muted">
        {intl.formatMessage({ id: "librarian.ruleList.hint" })}
      </p>
      <ListGroup
        as="ul"
        className="librarian-rule-list"
        onDragOver={onContainerDragOver}
      >
        {tempRules.map((rule, index) => (
          <RuleEditor
            key={rule.id}
            rule={rule}
            onChange={(next) => updateAt(index, next)}
            onRemove={() => removeAt(index)}
            draggable={mouseOverIndex === index}
            onDragStart={(e) => onItemDragStart(e, index)}
            onDragEnter={(e) => onItemDragEnter(e, index)}
            onDrop={onItemDrop}
            onHandleMouseEnter={() => setMouseOverIndex(index)}
            onHandleMouseLeave={() => setMouseOverIndex(undefined)}
            config={config}
            entityType={entityType}
            autoOpen={rule.id === justAddedId}
            onAutoOpened={() => setJustAddedId(null)}
            hasEarlierActiveRule={tempRules
              .slice(0, index)
              .some((r) => r.enabled !== false && r.conditions.length > 0)}
          />
        ))}
      </ListGroup>
      <Button variant="secondary" className="mt-2" onClick={addRule}>
        {intl.formatMessage({ id: "librarian.ruleList.addRule" })}
      </Button>
    </div>
  );
}
