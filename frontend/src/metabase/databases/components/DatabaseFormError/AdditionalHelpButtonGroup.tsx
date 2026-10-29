import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { useSelector } from "metabase/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { Box, Button, Divider, Icon } from "metabase/ui";

import S from "./AdditionalHelpButtonGroup.module.css";
import { ContactSupportButtonSection } from "./ContactSupportButtonSection";

export const AdditionalHelpButtonGroup = () => {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const docsUrl = useSelector((state) => getDocsUrl(state, { page: "" }));

  return (
    <>
      <Divider variant="dashed" />
      {showMetabaseLinks && (
        <Box className={S.row} px="lg" py="md">
          <Button
            component={Link}
            leftSection={<Icon name="reference" />}
            target="_blank"
            to={docsUrl}
            variant="transparent"
            size="compact-md"
          >
            {t`Read the docs`}
          </Button>
        </Box>
      )}
      <ContactSupportButtonSection />
    </>
  );
};
