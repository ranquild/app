import { useCreateDatabaseMutation } from "metabase/api";
import { DatabaseForm } from "metabase/databases/components/DatabaseForm";
import { getDatabaseRequest, getSubmitError } from "metabase/databases/utils/submit";
import type { DatabaseData } from "metabase-types/api";

import { SETUP_DATABASE_NAME } from "../../constants";

const INITIAL_VALUES = { name: SETUP_DATABASE_NAME, engine: "postgres" };

interface DatabaseStepProps {
  onDone: () => void;
  onSkip: () => void;
}

export function DatabaseStep({ onDone, onSkip }: DatabaseStepProps) {
  const [createDatabase] = useCreateDatabaseMutation();

  const handleSubmit = async (values: DatabaseData) => {
    try {
      await createDatabase(getDatabaseRequest(values)).unwrap();
    } catch (error) {
      throw getSubmitError(error);
    }
    onDone();
  };

  return (
    <DatabaseForm
      initialValues={INITIAL_VALUES}
      location="setup"
      onSubmit={handleSubmit}
      onCancel={onSkip}
    />
  );
}
