import type { ReactNode } from "react";

import { useSetting } from "metabase/settings";
import { Navigate, Outlet } from "metabase/router";
import { Center, Loader } from "metabase/ui";
import * as Urls from "metabase/urls";

function FullPageLoader() {
  return (
    <Center h="100%">
      <Loader />
    </Center>
  );
}

export function RootRedirect() {
  const isSetUp = useSetting("has-user-setup");

  if (isSetUp === undefined) {
    return <FullPageLoader />;
  }
  return <Navigate to={isSetUp ? Urls.environments() : Urls.setup()} replace />;
}

export function RequireSetup({ children }: { children?: ReactNode }) {
  const isSetUp = useSetting("has-user-setup");

  if (isSetUp === undefined) {
    return <FullPageLoader />;
  }
  if (!isSetUp) {
    return <Navigate to={Urls.setup()} replace />;
  }
  return children ?? <Outlet />;
}
