import { t } from "ttag";

import type { CreateDatabaseRequest, DatabaseData } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

/** The request body for the database the form submitted: the API stores only its name, engine, and details. */
export function getDatabaseRequest({
  name,
  engine,
  details,
}: DatabaseData): CreateDatabaseRequest {
  if (engine == null) {
    throw new Error(t`Choose a database type`);
  }
  return { name, engine, details: { ...details } };
}

/**
 * A failed save's per-field connection errors (`host`, `port`, …) under `details`, where the form's detail fields
 * read them.
 */
export function getSubmitError(error: unknown): unknown {
  if (isObject(error) && isObject(error.data) && isObject(error.data.errors)) {
    return {
      ...error,
      data: { ...error.data, errors: { details: error.data.errors } },
    };
  }
  return error;
}
