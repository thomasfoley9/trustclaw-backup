import { trpcServer, HydrateClient } from "~/clients/trpc/server";
import { SettingsPageClient } from "./_components/settings-page-client";

export default async function Page() {

  // Awaited (not fire-and-forget): in-flight streamed prefetches can settle
  // between server render and client hydration, mismatching the two renders
  // (React #418). Settled-before-render is deterministic on both sides.
  await Promise.all([
    trpcServer.api.trustclaw.getInstance.prefetch(),
    trpcServer.api.trustclaw.getCronJobs.prefetchInfinite({ limit: 20 }),
    trpcServer.api.trustclaw.getMemories.prefetch({ limit: 50 }),
  ]);

  return (
    <HydrateClient>
      <SettingsPageClient />
    </HydrateClient>
  );
}
