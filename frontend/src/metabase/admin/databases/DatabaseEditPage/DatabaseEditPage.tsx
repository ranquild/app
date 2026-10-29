import { t } from "ttag";

import {
  getErrorMessage,
  useCreateDatabaseMutation,
  useDeleteDatabaseMutation,
  useGetDatabaseQuery,
  useUpdateDatabaseMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageHeader } from "metabase/common/components/PageHeader";
import { StatusMessage } from "metabase/common/components/StatusMessage";
import { DatabaseForm } from "metabase/databases/components/DatabaseForm";
import { getDatabaseRequest, getSubmitError } from "metabase/databases/utils/submit";
import { useNavigate, useParams } from "metabase/router";
import { useSetting } from "metabase/settings";
import { Button, Group } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Database, DatabaseData } from "metabase-types/api";

import { SettingsCard } from "../../components/SettingsCard/SettingsCard";

export function DatabaseEditPage() {
  const params = useParams();
  const id = params.id ? Number(params.id) : null;
  const { data: database, error, isLoading } = useGetDatabaseQuery(id ?? 0, { skip: id == null });
  const engines = useSetting("engines");

  return (
    <>
      <PageHeader title={id == null ? t`Add a database` : (database?.name ?? t`Database`)} />
      <LoadingAndErrorWrapper loading={isLoading || engines == null} error={error}>
        {id == null ? <DatabaseEditForm /> : database && <DatabaseEditForm database={database} />}
      </LoadingAndErrorWrapper>
    </>
  );
}

function DatabaseEditForm({ database }: { database?: Database }) {
  const navigate = useNavigate();
  const [createDatabase] = useCreateDatabaseMutation();
  const [updateDatabase] = useUpdateDatabaseMutation();
  const [deleteDatabase, deleteState] = useDeleteDatabaseMutation();

  const handleSubmit = async (values: DatabaseData) => {
    try {
      const body = getDatabaseRequest(values);
      await (database ? updateDatabase({ id: database.id, ...body }) : createDatabase(body)).unwrap();
    } catch (error) {
      throw getSubmitError(error);
    }
    navigate(Urls.adminDatabases());
  };

  const handleDelete = async () => {
    if (database && !("error" in (await deleteDatabase(database.id)))) {
      navigate(Urls.adminDatabases());
    }
  };

  return (
    <SettingsCard>
      <DatabaseForm
        initialValues={database}
        config={{ isAdvanced: true }}
        location="admin"
        onSubmit={handleSubmit}
        onCancel={() => navigate(Urls.adminDatabases())}
      />
      {database && (
        <>
          {deleteState.error && <StatusMessage status="error" message={getErrorMessage(deleteState.error)} />}
          <Group justify="flex-end">
            <Button variant="subtle" color="negative" loading={deleteState.isLoading} onClick={handleDelete}>
              {t`Remove database`}
            </Button>
          </Group>
        </>
      )}
    </SettingsCard>
  );
}
