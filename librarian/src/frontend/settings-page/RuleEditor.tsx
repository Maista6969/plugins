import React, { useState, useEffect } from "react";
import { adapterFor } from "../../core/entity-adapter.js";
import { Condition } from "./ConditionRow.js";
import { RuleEditModal } from "./RuleEditModal.js";
import { ConfirmModal } from "../shared/ConfirmModal.js";
import { describePatternPair } from "../../core/path-template.js";

const PluginApi = (window as any).PluginApi;
const { Form, Button, ListGroup } = PluginApi.libraries.Bootstrap;
const { faGripVertical, faCog, faMinus, faTrash } =
  PluginApi.libraries.FontAwesomeSolid;
const Icon = PluginApi.components.Icon;

export interface Rule {
  id: string;
  name?: string;
  enabled: boolean;
  conditionLogic: "AND" | "OR";
  conditions: Condition[];
  folderPattern: string;
  filenamePattern: string;
  sortBy?: string;
  libraryRoot?: string;
  stashBoxEndpoint?: string;
}

interface RuleEditorProps {
  rule: Rule;
  onChange: (next: Rule) => void;
  onRemove: () => void;
  draggable: boolean;
  onDragStart: (e: React.DragEvent<HTMLElement>) => void;
  onDragEnter: (e: React.DragEvent<HTMLElement>) => void;
  onDrop: () => void;
  onHandleMouseEnter: () => void;
  onHandleMouseLeave: () => void;
  config: any;
  entityType?: string;
  hasEarlierActiveRule: boolean;
  autoOpen?: boolean;
  onAutoOpened?: () => void;
}

export function RuleEditor({
  rule,
  onChange,
  onRemove,
  draggable,
  onDragStart,
  onDragEnter,
  onDrop,
  onHandleMouseEnter,
  onHandleMouseLeave,
  config,
  entityType,
  hasEarlierActiveRule,
  autoOpen,
  onAutoOpened,
}: RuleEditorProps) {
  const [showModal, setShowModal] = useState(!!autoOpen);

  // Consume the flag on mount so returning to this tab does not reopen the
  // modal: switching tabs remounts these rows, re-evaluating the initial state
  useEffect(() => {
    if (autoOpen && onAutoOpened) {
      onAutoOpened();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const enabled = rule.enabled !== false;

  return (
    <ListGroup.Item
      as="li"
      className={"librarian-rule-row" + (enabled ? "" : " disabled")}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDrop={onDrop}
    >
      <div
        className="librarian-drag-handle"
        onMouseEnter={onHandleMouseEnter}
        onMouseLeave={onHandleMouseLeave}
        title="Drag to reorder"
      >
        <Icon icon={faGripVertical} />
      </div>
      <div className="librarian-rule-row-main">
        <div className="librarian-rule-row-name">
          {rule.name || "Unnamed rule"}
        </div>
        {rule.folderPattern || rule.filenamePattern ? (
          <div className="librarian-token-hint librarian-rule-row-pattern text-muted">
            {describePatternPair(rule.folderPattern, rule.filenamePattern)}
          </div>
        ) : (
          <div className="librarian-token-hint text-muted">No pattern set</div>
        )}
      </div>
      <div className="librarian-rule-row-actions">
        <Form.Switch
          id={"librarian-rule-enabled-" + rule.id}
          label="Enabled"
          checked={enabled}
          onChange={() => onChange({ ...rule, enabled: !enabled })}
        />
        <Button
          className="minimal"
          onClick={() => setShowModal(true)}
          title="Edit rule"
        >
          <Icon icon={faCog} />
        </Button>
        <Button
          className="minimal text-danger"
          onClick={() => setConfirmingDelete(true)}
          title="Delete rule"
        >
          <Icon icon={faMinus} />
        </Button>
      </div>
      {showModal && (
        <RuleEditModal
          rule={rule}
          onChange={onChange}
          onClose={() => setShowModal(false)}
          config={config}
          entityType={entityType}
          hasEarlierActiveRule={hasEarlierActiveRule}
        />
      )}
      {confirmingDelete && (
        <ConfirmModal
          show
          icon={faTrash}
          header="Delete this rule?"
          cancel={{ text: "Cancel", onClick: () => setConfirmingDelete(false) }}
          accept={{
            text: "Delete",
            variant: "danger",
            onClick: () => {
              setConfirmingDelete(false);
              onRemove();
            },
          }}
        >
          <p>
            “{rule.name || "Unnamed rule"}” will be permanently removed. The{" "}
            {adapterFor(entityType).plural} it currently matches will fall
            through to the next rule (or the default pattern) instead
          </p>
        </ConfirmModal>
      )}
    </ListGroup.Item>
  );
}
