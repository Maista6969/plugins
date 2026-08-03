import React from "react";

const PluginApi = (window as any).PluginApi;
const { Card } = PluginApi.libraries.Bootstrap;

interface SettingsSectionProps {
  heading: React.ReactNode;
  subHeading?: React.ReactNode;
  children: React.ReactNode;
}
// Simpler version of Stash's section wrapper ui/v2.5/src/components/Settings/SettingSection.tsx
// since that component isn't exposed through PluginApi yet, can be removed if that happens
export function SettingsSection({
  heading,
  subHeading,
  children,
}: SettingsSectionProps) {
  return (
    <div className="setting-section">
      <h1>{heading}</h1>
      {subHeading ? <div className="sub-heading">{subHeading}</div> : null}
      <Card>{children}</Card>
    </div>
  );
}
