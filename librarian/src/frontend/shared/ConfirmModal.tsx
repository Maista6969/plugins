import React from "react";

const PluginApi = (window as any).PluginApi;
const { Modal, Button } = PluginApi.libraries.Bootstrap;
const Icon = PluginApi.components.Icon;

interface ConfirmButton {
  text: string;
  variant?: string;
  onClick: () => void;
}

interface ConfirmModalProps {
  show: boolean;
  icon?: any;
  header?: React.ReactNode;
  cancel: ConfirmButton;
  accept: ConfirmButton;
  children: React.ReactNode;
}

// Simpler version of Stash's modal ui/v2.5/src/components/Shared/Modal.tsx
export function ConfirmModal({
  show,
  icon,
  header,
  cancel,
  accept,
  children,
}: ConfirmModalProps) {
  return (
    <Modal
      className="ModalComponent"
      keyboard={false}
      onHide={cancel.onClick}
      show={show}
    >
      <Modal.Header>
        {icon ? <Icon icon={icon} /> : ""}
        <span>{header ?? ""}</span>
      </Modal.Header>
      <Modal.Body>{children}</Modal.Body>
      <Modal.Footer className="ModalFooter">
        <div />
        <div>
          <Button
            variant={cancel.variant ?? "secondary"}
            onClick={cancel.onClick}
            className="ml-2"
          >
            {cancel.text}
          </Button>
          <Button
            variant={accept.variant ?? "primary"}
            onClick={accept.onClick}
            className="ml-2"
          >
            {accept.text}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
