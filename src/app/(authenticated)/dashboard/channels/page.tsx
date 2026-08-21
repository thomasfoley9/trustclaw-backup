import { trpcServer, HydrateClient } from "~/clients/trpc/server";
import { ChannelsClient } from "./_components/channels-client";

export default async function Page() {
  void trpcServer.api.trustclaw.getChannels.prefetch();

  return (
    <HydrateClient>
      <ChannelsClient />
    </HydrateClient>
  );
}
