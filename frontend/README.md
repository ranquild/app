# DevEnv frontend

React 18 + TypeScript + Mantine 8, laid out like Metabase's frontend:

| Path                               | What                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `src/metabase/ui`                  | The subset of `metabase/ui` DevEnv uses: components, theme, colors, icons     |
| `src/metabase/api`                 | RTK Query endpoints, one file per backend resource                            |
| `src/metabase-types/api`           | Types for the backend's request and response shapes                           |
| `src/metabase/setup`               | Welcome page and the 5-step setup wizard                                      |
| `src/metabase/auth`                | Login, forgot and reset password                                              |
| `src/metabase/workspaces`          | Workspace list, "New workspace" modal, split-view workspace page              |
| `src/metabase/admin`               | Admin settings (General, Remote sync, AI provider, License) and Databases     |
| `src/metabase/nav`                 | `AreaLayout`, the collapsible-sidebar shell Data Studio and Monitor also use  |
| `test/__support__`                 | `renderWithProviders`, the MSW server and `setupEndpoint`, fixtures           |

From the repo root:

- `bun run dev` starts the backend (`clojure -M:run`, port 3100) and Vite (port 3000, proxying `/api`). Open
  http://localhost:3000.
- `bun run build` writes the production bundle to `resources/frontend_client/`, which the backend serves.
- `bun run test`, `bun run lint`, `bun run type-check`.

`frontend/scripts/copy-metabase-ui.sh` re-syncs `src/metabase/ui` from a Metabase checkout.
