import { MantineProvider } from "@mantine/core";
import { type ReactNode, useMemo } from "react";

import { getThemeOverrides } from "../../../theme";

import { GlobalStyles } from "./GlobalStyles";

export interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const theme = useMemo(() => getThemeOverrides(), []);

  return (
    <MantineProvider theme={theme} forceColorScheme="light" classNamesPrefix="mb-mantine">
      <GlobalStyles />
      {children}
    </MantineProvider>
  );
};
