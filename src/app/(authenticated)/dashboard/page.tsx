import { trpcServer, HydrateClient } from "~/clients/trpc/server";
import { ErrorBoundary } from "~/components/core/error-boundary";
import { TrustClawChat } from "./_components/chat/trustclaw-chat";
import { ConversationSidebar } from "./_components/conversation-sidebar";
import { OnboardingClient } from "./_components/onboarding/onboarding-client";
import { ConversationDrawer } from "./_components/conversation-drawer";
import { DashboardPanels } from "./_components/dashboard-panels";

// NOTE: deliberately NO data prefetching for the chat tree. Streamed prefetch
// hydration raced client hydration here (server HTML rendered from data the
// client didn't have yet, or vice versa), causing React #418 and a wedged,
// frozen page. Client components fetch on mount instead - server and client
// both deterministically render loading states first. Slightly later first
// paint of data, but no hydration mismatch class at all.
export default async function Page() {
  const status = await trpcServer.api.trustclaw.getStatus();

  // redoOnboarding = the user asked to re-run setup from Settings; the wizard
  // renders over the dashboard with prior answers preserved, nothing deleted.
  if (!status.hasInstance || status.redoOnboarding) {
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

  // No Composio key is NOT a wall: chat, memory, and house models all work
  // without one. The dashboard layout's ComposioKeyBanner carries the ask.
  return (
    <HydrateClient>
      <div className="flex h-full min-h-0">
        <ConversationDrawer />
        <DashboardPanels
          sidebar={
            <ErrorBoundary>
              <ConversationSidebar />
            </ErrorBoundary>
          }
        >
          <ErrorBoundary>
            <TrustClawChat />
          </ErrorBoundary>
        </DashboardPanels>
      </div>
    </HydrateClient>
  );
}
