import type { SerializedError } from "@reduxjs/toolkit";

import type { ApiError } from "./api";

interface ErrorBody {
  message?: string;
  errors?: Record<string, string>;
  "specific-errors"?: Record<string, unknown>;
}

function isErrorBody(body: unknown): body is ErrorBody {
  return typeof body === "object" && body !== null;
}

/**
 * A human-readable message for an RTK Query error: the backend's plain-text body, its `message`, or its first
 * field error.
 */
export function getErrorMessage(
  error: ApiError | SerializedError | undefined,
  fallback = "Something went wrong",
): string {
  if (!error) {
    return fallback;
  }
  if ("status" in error) {
    const body = error.data;
    if (typeof body === "string" && body.length > 0) {
      return body;
    }
    if (isErrorBody(body)) {
      if (body.message) {
        return body.message;
      }
      const firstFieldError = body.errors && Object.values(body.errors)[0];
      if (firstFieldError) {
        return String(firstFieldError);
      }
    }
    return fallback;
  }
  return error.message ?? fallback;
}

/** Whether `error` is an HTTP error with `status`. */
export function isStatusError(
  error: ApiError | SerializedError | undefined,
  status: number,
) {
  return error != null && "status" in error && error.status === status;
}
