import { useMemo } from "react";

import { deriveFullMetabaseTheme } from "metabase/ui/colors";

/**
 * Defines the `--mb-color-*` CSS variables every metabase/ui component and CSS module reads, plus the default font.
 */
export function GlobalStyles() {
  const css = useMemo(() => {
    const { colors } = deriveFullMetabaseTheme({ colorScheme: "light" });
    const colorVars = Object.entries(colors)
      .map(([name, value]) => `--mb-color-${name}: ${value};`)
      .join("\n");

    return `
      :root {
        --mb-default-font-family: "Lato", sans-serif;
        --mb-default-monospace-font-family: "JetBrains Mono", monospace;
        --mb-overlay-z-index: 200;
        ${colorVars}
      }
      body {
        margin: 0;
        font-family: var(--mb-default-font-family);
        font-size: 0.875em;
        color: var(--mb-color-text-primary);
        background-color: var(--mb-color-background-secondary);
        color-scheme: light;
        -webkit-font-smoothing: antialiased;
      }
    `;
  }, []);

  return <style data-devenv-global-styles>{css}</style>;
}
