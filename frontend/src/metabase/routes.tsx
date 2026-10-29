import type { RouteObject } from "react-router";

import {
  AdminLayout,
  AiProviderSettingsPage,
  DatabaseEditPage,
  DatabaseListPage,
  LicenseSettingsPage,
} from "metabase/admin";
import { EnvironmentDetailPage } from "metabase/environments/pages/EnvironmentDetailPage";
import { EnvironmentListPage } from "metabase/environments/pages/EnvironmentListPage";
import { MainLayout } from "metabase/nav/containers/MainLayout";
import { RequireSetup, RootRedirect } from "metabase/route-guards";
import { Navigate } from "metabase/router";
import { SetupApp } from "metabase/setup";
import * as Urls from "metabase/urls";

export function getRoutes(): RouteObject[] {
  return [
    { path: "/", element: <RootRedirect /> },
    { path: "/setup", element: <SetupApp /> },
    {
      element: <RequireSetup />,
      children: [
        {
          path: "/environments",
          element: <MainLayout />,
          children: [{ index: true, element: <EnvironmentListPage /> }],
        },
        { path: "/environments/:id", element: <EnvironmentDetailPage /> },
        {
          path: "/admin",
          element: <AdminLayout />,
          children: [
            { index: true, element: <Navigate to={Urls.adminLicense()} replace /> },
            { path: "settings/ai-provider", element: <AiProviderSettingsPage /> },
            { path: "settings/license", element: <LicenseSettingsPage /> },
            { path: "databases", element: <DatabaseListPage /> },
            { path: "databases/create", element: <DatabaseEditPage /> },
            { path: "databases/:id", element: <DatabaseEditPage /> },
          ],
        },
      ],
    },
    { path: "*", element: <Navigate to={Urls.root()} replace /> },
  ];
}
