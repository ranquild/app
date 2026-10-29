import { t } from "ttag";

import { HelpCard } from "metabase/common/components/HelpCard";
import { useSelector } from "metabase/redux";
import { getDocsUrl } from "metabase/selectors/settings";

export interface DatabaseHelpCardProps {
  className?: string;
}

export const DatabaseHelpCard = ({
  className,
}: DatabaseHelpCardProps): JSX.Element => {
  const docsUrl = useSelector((state) =>
    getDocsUrl(state, { page: "databases/connecting" }),
  );

  return (
    <HelpCard
      title={t`Need help connecting?`}
      className={className}
      helpUrl={docsUrl}
    >
      <p>{t`See our docs for step-by-step directions on how to connect your database.`}</p>
    </HelpCard>
  );
};
