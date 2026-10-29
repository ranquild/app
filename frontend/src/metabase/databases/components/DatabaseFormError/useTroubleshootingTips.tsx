import { createSelector } from "@reduxjs/toolkit";
import { useMemo } from "react";
import { c, t } from "ttag";
import { identity } from "underscore";

import { useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { getDocsUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";

import type { TipProps as _TipProps } from "./TroubleshootingTip";
import { getDocsLinkConditionally } from "./utils";

type TipKey =
  | "ssl"
  | "permissions"
  | "connection-settings"
  | "credentials";
type TipProps = _TipProps & { key: TipKey };

export const useTroubleshootingTips = (
  isHostAndPortError: boolean,
  expanded: boolean,
): TipProps[] => {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const getDocPageUrl = useSelector(docPageUrlGetter);

  return useMemo(() => {
    if (isHostAndPortError && !expanded) {
      return [];
    }

    const sslCertLinkContent = getDocsLinkConditionally(
      t`SSL certificate`,
      getDocPageUrl("databases/ssl-certificates"),
      showMetabaseLinks,
    );
    const permissionsLinkContent = getDocsLinkConditionally(
      t`correct permissions`,
      getDocPageUrl("databases/users-roles-privileges"),
      showMetabaseLinks,
    );

    return [
      {
        key: "ssl" as const,
        title: t`Try using a secure connection (SSL)`,
        body: c("{0} refers to 'SSL certificate'")
          .jt`You’ll need an ${sslCertLinkContent} to do this.`,
      },
      {
        key: "permissions" as const,
        title: t`Check Metabase user permissions`,
        body: c("{0} refers to 'correct permissions'")
          .jt`Check that Metabase has the ${permissionsLinkContent} or user role for your database.`,
      },
      {
        key: "connection-settings" as const,
        title: t`Double-check connection settings`,
        body: t`Make sure the host name, port or database name don’t contain typos.`,
      },
      {
        key: "credentials" as const,
        title: t`Double-check access credentials`,
        body: t`Is the username and password correct? If possible, copy-paste the values to the form.`,
      },
    ].filter((tip) => {
      const initialTips: TipKey[] = ["ssl", "permissions"];
      return expanded || initialTips.includes(tip.key);
    });
  }, [
    expanded,
    getDocPageUrl,
    isHostAndPortError,
    showMetabaseLinks,
  ]);
};

const docPageUrlGetter = createSelector([identity], (state: State) => {
  return (page: string): string => getDocsUrl(state, { page });
});
