// Copied verbatim from Stash, which does not expose these through PluginApi:
//   https://github.com/stashapp/stash/blob/develop/ui/v2.5/src/components/Shared/FileSize.tsx
//   https://github.com/stashapp/stash/blob/develop/ui/v2.5/src/utils/text.ts
//     (Unit, Units, shortUnits, fileSize, formatFileSizeUnit, fileSizeFractionalDigits)
// Keep in sync with the originals; the only edit is that the TextUtils import
// is replaced by the functions themselves, below the component.
import React from "react";
import { FormattedNumber } from "react-intl";

export const FileSize: React.FC<{ size: number }> = ({ size: fileSize_ }) => {
  const { size, unit } = fileSize(fileSize_);

  return (
    <>
      <FormattedNumber
        value={size}
        maximumFractionDigits={fileSizeFractionalDigits(unit)}
      />
      {` ${formatFileSizeUnit(unit)}`}
    </>
  );
};

// Typescript currently does not implement the intl Unit interface
type Unit =
  "byte" | "kibibyte" | "mebibyte" | "gibibyte" | "tebibyte" | "pebibyte";
const Units: Unit[] = [
  "byte",
  "kibibyte",
  "mebibyte",
  "gibibyte",
  "tebibyte",
  "pebibyte",
];
const shortUnits = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];

const fileSize = (bytes: number = 0) => {
  if (Number.isNaN(parseFloat(String(bytes))) || !Number.isFinite(bytes))
    return { size: 0, unit: Units[0] };

  let unit = 0;
  let count = bytes;
  // calculating base 2 units
  while (count >= 1024 && unit + 1 < Units.length) {
    count /= 1024;
    unit++;
  }

  return {
    size: count,
    unit: Units[unit],
  };
};

const formatFileSizeUnit = (u: Unit) => {
  const i = Units.indexOf(u);
  return shortUnits[i];
};

// returns the number of fractional digits to use when displaying file sizes
// returns 0 for MB and under, 1 for GB and over.
const fileSizeFractionalDigits = (unit: Unit) => {
  if (Units.indexOf(unit) >= 3) {
    return 1;
  }

  return 0;
};
