import { useSessionStorage } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { useGetSetupStatusQuery, useListDatabasesQuery } from "metabase/api";
import { getAiProvider } from "metabase/ai-provider/constants";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box } from "metabase/ui";
import * as Urls from "metabase/urls";

import { AiProviderStep } from "../../components/AiProviderStep/AiProviderStep";
import { CompletedStep } from "../../components/CompletedStep/CompletedStep";
import { DatabaseStep } from "../../components/DatabaseStep/DatabaseStep";
import { LicenseStep } from "../../components/LicenseStep/LicenseStep";
import { SetupLayout } from "../../components/SetupLayout";
import { SetupStep, type SetupStepState } from "../../components/SetupStep";
import { WelcomePage } from "../../components/WelcomePage/WelcomePage";
import { SETUP_STEPS, type SetupStepId } from "../../constants";

export interface SetupProgress {
  completed: Record<SetupStepId, boolean>;
  skipped: SetupStepId[];
}

export function getActiveStep({ completed, skipped }: SetupProgress): SetupStepId | null {
  return SETUP_STEPS.find((step) => !completed[step] && !skipped.includes(step)) ?? null;
}

function getStepState(step: SetupStepId, activeStep: SetupStepId | null, progress: SetupProgress): SetupStepState {
  if (step === activeStep) {
    return "active";
  }
  if (progress.completed[step] || progress.skipped.includes(step)) {
    return "done";
  }
  return "pending";
}

export function SetupApp() {
  const [hasStarted, setHasStarted] = useState(false);
  const [skipped, setSkipped] = useSessionStorage<SetupStepId[]>({
    key: "app.setup.skipped",
    defaultValue: [],
  });
  const statusQuery = useGetSetupStatusQuery();
  const databasesQuery = useListDatabasesQuery();

  if (statusQuery.isLoading || databasesQuery.isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  const status = statusQuery.data;
  const progress: SetupProgress = {
    completed: {
      license: Boolean(status?.["license_valid?"]),
      database: (databasesQuery.data?.total ?? 0) > 0,
      ai: Boolean(status?.["ai_configured?"]),
    },
    skipped,
  };
  const activeStep = getActiveStep(progress);
  const skip = (step: SetupStepId) => setSkipped((current) => [...new Set([...current, step])]);
  const isUntouched = !progress.completed.license && !progress.completed.ai && !progress.completed.database;

  if (isUntouched && !hasStarted) {
    return <WelcomePage onStart={() => setHasStarted(true)} />;
  }

  if (activeStep === null) {
    return (
      <SetupLayout showLanguage={false}>
        <CompletedStep
          isLicenseActive={progress.completed.license}
          isDatabaseConnected={progress.completed.database}
          aiProvider={progress.completed.ai ? getAiProvider(status?.summary?.ai_provider).displayName : null}
          onFinish={() => {
            setSkipped([]);
            window.location.assign(Urls.environments());
          }}
        />
      </SetupLayout>
    );
  }

  const state = (step: SetupStepId) => getStepState(step, activeStep, progress);

  return (
    <SetupLayout>
      <Box>
        <SetupStep
          number={1}
          title={t`Activate your Metabase license`}
          description={t`Every environment's Metabase runs with it. A config file, which bootstraps each Metabase, needs a Pro or Enterprise token.`}
          doneTitle={t`Your license is active`}
          state={state("license")}
        >
          <LicenseStep onDone={() => statusQuery.refetch()} />
        </SetupStep>
        <SetupStep
          number={2}
          title={t`Add a database`}
          description={t`Every environment's Metabase connects to the databases added here. Use a host the containers can reach, e.g. host.docker.internal.`}
          doneTitle={progress.completed.database ? t`Database connected` : t`You'll add a database later`}
          state={state("database")}
        >
          <DatabaseStep onDone={() => databasesQuery.refetch()} onSkip={() => skip("database")} />
        </SetupStep>
        <SetupStep
          number={3}
          title={t`Connect an AI provider`}
          description={t`Powers the pi agent inside each environment.`}
          doneTitle={t`AI provider connected`}
          state={state("ai")}
        >
          <AiProviderStep onDone={() => statusQuery.refetch()} />
        </SetupStep>
      </Box>
    </SetupLayout>
  );
}
