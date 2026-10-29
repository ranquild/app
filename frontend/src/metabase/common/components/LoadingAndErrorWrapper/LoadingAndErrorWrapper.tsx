import type { SerializedError } from "@reduxjs/toolkit";
import type { ReactNode } from "react";

import { type ApiError, getErrorMessage } from "metabase/api";
import { Alert, Center, Loader } from "metabase/ui";

interface LoadingAndErrorWrapperProps {
  loading: boolean;
  error?: ApiError | SerializedError;
  children?: ReactNode;
}

export function LoadingAndErrorWrapper({
  loading,
  error,
  children,
}: LoadingAndErrorWrapperProps) {
  if (error) {
    return (
      <Alert color="error" icon={null} title={getErrorMessage(error)} />
    );
  }
  if (loading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }
  return <>{children}</>;
}
