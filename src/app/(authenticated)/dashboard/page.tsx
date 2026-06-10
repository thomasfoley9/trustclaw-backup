import { trpcServer, HydrateClient } from "~/clients/trpc/server";
import { ErrorBoundary } from "~/components/core/error-boundary";
import { TrustClawChat } from "./_components/chat/trustclaw-chat";
import { ConversationSidebar } from "./_components/conversation-sidebar";
import { OnboardingClient } from "./_components/onboarding/onboarding-client";

// NOTE: deliberately NO data prefetching for the chat tree. Streamed prefetch
// hydration raced client hydration here (server HTML rendered from data the
// client didn't have yet, or vice versa), causing React #418 and a wedged,
// frozen page. Client components fetch on mount instead - server and client
// both deterministically render loading states first. Slightly later first
// paint of data, but no hydration mismatch class at all.
export default async function Page() {
  const status = await trpcServer.api.trustclaw.getStatus();

  if (!status.hasInstance) {
    return (
      <HydrateClient>
        <ErrorBoundary>
          <OnboardingClient
            hasExistingInstance={status.hasInstance}
            hasOnboardingState={status.hasOnboardingState}
          />
        </ErrorBoundary>
      </HydrateClient>
    );
  }

  return (
    <HydrateClient>
      <div className="flex h-full min-h-0">
        <ErrorBoundary>
          <ConversationSidebar />
        </ErrorBoundary>
        <div className="min-w-0 flex-1">
          <ErrorBoundary>
            <TrustClawChat />
          </ErrorBoundary>
        </div>
      </div>
    </HydrateClient>
  );
}
