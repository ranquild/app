// NOTE: DO NOT ADD COLORS WITHOUT EXTREMELY GOOD REASON AND DESIGN REVIEW

import type { ColorSettings } from "metabase-types/api/settings";

import { getBaseColorsForThemeDefinitionOnly } from "./constants/base-colors";
import { deriveFullMetabaseTheme } from "./derive-theme";
import type { MetabaseColorKey } from "./types/color-keys";

// App has no whitelabelling
const whitelabelColors: ColorSettings = {};

const baseColors = getBaseColorsForThemeDefinitionOnly();

export const getColors = (whitelabelColors?: ColorSettings) =>
  deriveFullMetabaseTheme({ colorScheme: "light", whitelabelColors }).colors;

export const colors: Record<MetabaseColorKey, string> =
  getColors(whitelabelColors);

export const mutateColors = (whitelabelColors: ColorSettings) => {
  // Empty the `colors` object to make sure we don't hold onto previously defined (now undefined) values
  Object.keys(colors).forEach((key) => {
    // Unjustified type cast. FIXME
    delete colors[key as keyof typeof colors];
  });
  Object.assign(colors, getColors(whitelabelColors));
};

export const staticVizOverrides = {
  "text-primary": baseColors.orion[80],
  "text-secondary": baseColors.orion[60],
  "text-disabled": baseColors.orion[40],
};
