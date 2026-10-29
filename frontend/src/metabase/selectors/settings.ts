import { getSetting } from "metabase/settings";
import type { State } from "metabase/store";
import type { Version } from "metabase-types/api";

export const getLearnUrl = (path = "") => {
  return `https://www.metabase.com/learn/${path}`;
};

export type UtmProps = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
};

type UrlWithUtmProps = { url: string } & UtmProps;

const getUrlWithUtm = (props: UrlWithUtmProps) => {
  const { utm_source = "product", utm_medium, utm_campaign, utm_content } =
    props;

  const url = new URL(props.url);
  url.searchParams.set("utm_source", utm_source);
  if (utm_medium) {
    url.searchParams.set("utm_medium", utm_medium);
  }
  if (utm_campaign) {
    url.searchParams.set("utm_campaign", utm_campaign);
  }
  if (utm_content) {
    url.searchParams.set("utm_content", utm_content);
  }

  return url.toString();
};

interface DocsUrlProps {
  page?: string;
  anchor?: string;
  searchQuery?: string;
  utm?: UtmProps;
}

export const getDocsUrl = (state: State, props: DocsUrlProps) => {
  const url = props.searchQuery
    ? `https://www.metabase.com/search?${new URLSearchParams({
        query: props.searchQuery,
      })}`
    : getDocsUrlForVersion(
        getSetting(state, "version"),
        props.page,
        props.anchor,
      );

  if (!props.utm) {
    return url;
  }

  return getUrlWithUtm({ url, ...props.utm });
};

const getDocsUrlForVersion = (
  version: Version | undefined,
  page = "",
  anchor = "",
) => {
  let tag = version?.tag;
  const matches = tag && tag.match(/v[01]\.(\d+)(?:\.\d+)?(-.*)?/);

  if (matches) {
    if (
      matches.length > 2 &&
      matches[2] &&
      "-snapshot" === matches[2].toLowerCase()
    ) {
      // always point -SNAPSHOT suffixes to "latest", since this is likely a development build off of master
      tag = "latest";
    } else {
      // otherwise, it's a regular OSS or EE version string, just link to the major OSS doc link
      tag = "v0." + matches[1];
    }
  } else {
    // otherwise, just link to the latest tag
    tag = "latest";
  }

  if (page) {
    page = `${page}.html`;
  }

  if (anchor) {
    anchor = `#${anchor}`;
  }

  return `https://www.metabase.com/docs/${tag}/${page}${anchor}`;
};
