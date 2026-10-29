import { useLocalStorage } from "@mantine/hooks";
import { t } from "ttag";

import { LogoIcon } from "metabase/common/components/LogoIcon";
import { AreaContent, AreaLayout, AreaTab } from "metabase/nav/components/AreaLayout";
import { Outlet, useLocation } from "metabase/router";
import { Group, Text } from "metabase/ui";
import * as Urls from "metabase/urls";

export function MainLayout() {
  const [isNavbarOpened, setIsNavbarOpened] = useLocalStorage({
    key: "app.main.isNavbarOpened",
    defaultValue: true,
  });
  const { pathname } = useLocation();

  return (
    <AreaLayout
      logo={
        <Group gap="sm" wrap="nowrap">
          <LogoIcon height={24} />
          {isNavbarOpened && (
            <Text fw={900} fz="lg" c="text-primary">
              App
            </Text>
          )}
        </Group>
      }
      testId="main-nav"
      isNavbarOpened={isNavbarOpened}
      onNavbarToggle={setIsNavbarOpened}
      upperNav={
        <AreaTab
          label={t`Environments`}
          icon="layout_grid"
          to={Urls.environments()}
          isSelected={pathname.startsWith(Urls.environments())}
          showLabel={isNavbarOpened}
        />
      }
      lowerNav={
        <AreaTab
          label={t`Admin settings`}
          icon="gear"
          to={Urls.admin()}
          isSelected={pathname.startsWith(Urls.admin())}
          showLabel={isNavbarOpened}
        />
      }
    >
      <AreaContent>
        <Outlet />
      </AreaContent>
    </AreaLayout>
  );
}
