"use client";

import { useRouter } from "next/navigation";
import { trpc } from "~/clients/trpc";
import { trpcToastOnError } from "~/components/core/toast-notifications";
import { Onboarding } from "./onboarding";
import { OnboardingSkeleton } from "./onboarding.skeleton";

interface OnboardingClientProps {
  hasExistingInstance: boolean;
  hasOnboardingState: boolean;
}

export function OnboardingClient({
  hasExistingInstance,
  hasOnboardingState,
}: OnboardingClientProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.trustclaw.getInstance.useQuery(
    undefined,
    { enabled: hasOnboardingState },
  );

  // Clears the "Re-run setup" flag; a no-op on a fresh first run.
  const completeOnboarding = trpc.trustclaw.completeOnboarding.useMutation({
    onError: trpcToastOnError,
  });

  if (hasOnboardingState && isLoading) {
    return <OnboardingSkeleton />;
  }

  return (
    <Onboarding
      hasExistingInstance={hasExistingInstance}
      savedState={data?.onboardingState ?? null}
      onComplete={() => {
        void (async () => {
          try {
            await completeOnboarding.mutateAsync();
          } catch {
            // Toasted by onError; stay on the wizard rather than refreshing
            // into a loop where the redo flag is still set.
            return;
          }
          void utils.trustclaw.getStatus.invalidate();
          router.refresh();
        })();
      }}
    />
  );
}
