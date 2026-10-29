import { useLocalStorage } from "@mantine/hooks";
import { t } from "ttag";

import {
  AreaContent,
  AreaLayout,
  AreaTab,
  AreaTabGroup,
} from "metabase/nav/components/AreaLayout";
import { Link, Outlet, useLocation } from "metabase/router";
import { Group, Icon, Text } from "metabase/ui";
import * as Urls from "metabase/urls";

import S from "./AdminLayout.module.css";

export function AdminLayout() {
  const [isNavbarOpened, setIsNavbarOpened] = useLocalStorage({
    key: "devenv.admin.isNavbarOpened",
    defaultValue: true,
  });
  const { pathname } = useLocation();
  const tab = (label: string, to: string, icon: Parameters<typeof AreaTab>[0]["icon"]) => (
    <AreaTab
      label={label}
      icon={icon}
      to={to}
      isSelected={pathname.startsWith(to)}
      showLabel={isNavbarOpened}
    />
  );

  return (
    <AreaLayout
      logo={
        <Link to={Urls.environments()} className={S.back}>
          <Group gap="xs" wrap="nowrap">
            <Icon name="chevronleft" size={12} />
            {isNavbarOpened && <Text c="inherit" fw={700}>{t`Back to environments`}</Text>}
          </Group>
        </Link>
      }
      testId="admin-nav"
      isNavbarOpened={isNavbarOpened}
      onNavbarToggle={setIsNavbarOpened}
      upperNav={
        <>
          <AreaTabGroup label={t`Settings`} showLabel={isNavbarOpened} mb="lg">
            {tab(t`AI provider`, Urls.adminAiProvider(), "ai")}
            {tab(t`License`, Urls.adminLicense(), "key")}
          </AreaTabGroup>
          <AreaTabGroup label={t`Data`} showLabel={isNavbarOpened}>
            {tab(t`Databases`, Urls.adminDatabases(), "database")}
          </AreaTabGroup>
        </>
      }
    >
      <AreaContent>
        <Outlet />
      </AreaContent>
    </AreaLayout>
  );
}
