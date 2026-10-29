import { useState } from "react";
import { Provider } from "react-redux";
import { RouterProvider, createBrowserRouter } from "react-router";

import { getStore } from "metabase/store";
import { ThemeProvider } from "metabase/ui";

import { getRoutes } from "./routes";

export function App() {
  const [store] = useState(getStore);
  const [router] = useState(() => createBrowserRouter(getRoutes()));

  return (
    <Provider store={store}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </Provider>
  );
}
