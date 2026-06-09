import { trpcServer, HydrateClient } from "~/clients/trpc/server";
import { ErrorBoundary } from "~/components/core/error-boundary";
import { TrustClawChat } from "./_components/chat/trustclaw-chat";
import { ConversationSidebar } from "./_components/conversation-sidebar";
import { OnboardingClient } from "./_components/onboarding/onboarding-client";

export default async function Page() {
  void trpcServer.api.trustclaw.getStreamingMessage.prefetch();
  void trpcServer.api.trustclaw.getConversations.prefetch();

  const status = await trpcServer.api.trustclaw.getStatus();

  if (!status.hasInstance) {
    void trpcServer.api.trustclaw.getInstance.prefetch();

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
