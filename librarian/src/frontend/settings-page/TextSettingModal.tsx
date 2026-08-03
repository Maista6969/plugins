import React, { useState } from "react";

const PluginApi = (window as any).PluginApi;
const { Form } = PluginApi.libraries.Bootstrap;

interface TextSettingModalProps {
  value: string | undefined;
  onChange: (next: string) => void;
  heading: string;
  subHeading?: React.ReactNode;
  placeholder?: string;
  renderField?: (
    value: string | undefined,
    setValue: (v?: string) => void,
  ) => React.ReactNode;
  validate?: (value: string) => boolean;
}

function defaultRenderField(placeholder: string | undefined) {
  return (fieldValue: string | undefined, setValue: (v?: string) => void) => {
    return (
      <Form.Control
        autoFocus
        type="text"
        className="input-control"
        value={fieldValue || ""}
        placeholder={placeholder}
        onChange={(e: any) => setValue(e.target.value)}
      />
    );
  };
}

export function TextSettingModal({
  value,
  onChange,
  heading,
  subHeading,
  placeholder,
  renderField,
  validate,
}: TextSettingModalProps) {
  const { ChangeButtonSetting, SettingModal } = PluginApi.components;
  const [showModal, setShowModal] = useState(false);

  function onClose(v?: string) {
    if (v !== undefined) {
      onChange(v);
    }
    setShowModal(false);
  }

  return (
    <>
      {showModal && (
        <SettingModal
          heading={heading}
          value={value}
          close={onClose}
          renderField={renderField || defaultRenderField(placeholder)}
          validate={validate}
          modalProps={{ className: "librarian-nested-setting-modal" }}
        />
      )}
      <div>
        <ChangeButtonSetting
          heading={heading}
          subHeading={subHeading}
          value={value}
          onChange={() => setShowModal(true)}
          renderValue={(v: string | undefined) =>
            v || <span className="text-muted">(not set)</span>
          }
        />
      </div>
    </>
  );
}
