import { jt, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";

const DatabaseSshDescription = (): JSX.Element => {
  const { url: docsUrl } = useDocsUrl("databases/ssh-tunnel");

  return (
    <>
      {jt`If a direct connection to your database isn't possible, you may want to use an SSH tunnel. ${(
        <ExternalLink key="link" href={docsUrl}>{t`Learn more`}</ExternalLink>
      )}.`}
    </>
  );
};

export default DatabaseSshDescription;
