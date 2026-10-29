import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { Button, Flex } from "metabase/ui";

import { TroubleshootingTip } from "./TroubleshootingTip";

const HELP_URL =
  "https://www.metabase.com/help?utm_source=in-product&utm_medium=menu&utm_campaign=help";

export const ContactSupportButtonSection = () => {
  return (
    <TroubleshootingTip
      body={
        <Flex direction="column" gap="lg" align="flex-start">
          {t`Reach out to Metabase engineers who can help with technical troubleshooting. Not your typical support agents.`}
          <Button component={Link} target="_blank" to={HELP_URL}>
            {t`Contact Support`}
          </Button>
        </Flex>
      }
      noIcon
      pb="xxl"
      title={t`Still stuck? We’re here to help`}
    />
  );
};
