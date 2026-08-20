"use client";

import { trpc } from "~/clients/trpc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  showInfoToast,
  trpcToastOnError,
} from "~/components/core/toast-notifications";
import { PersonalityAvatar } from "~/app/_components/personality-avatar";
import { useVoiceCallStore } from "./chat/voice-call-store";

// Radix Select forbids empty item values - sentinel for "no active persona"
// (clears activePersonalityId, falling back to the model's default voice).
const DEFAULT_VOICE = "__default__";

export function PersonalityControl() {
  const utils = trpc.useUtils();
  const { data } = trpc.trustclaw.getPersonalities.useQuery();
  // A live call's persona is fixed when the call starts: the prompt is baked
  // into the voice agent's instructions at dispatch (api/livekit-token ->
  // claw-voice agent) and there is no channel to update a running session, so
  // the delegate pins to the same snapshot for the whole call. Switching is
  // still allowed - it just applies to the next call, and saying so beats
  // letting the user assume this call followed along.
  const liveCallActive = useVoiceCallStore((s) => s.liveCallActive);

  const updateSettings = trpc.trustclaw.updateSettings.useMutation({
    // Optimistic: reflect the pick immediately - without this the closed
    // select snaps back to the old value until the refetch lands.
    onMutate: async (input) => {
      await utils.trustclaw.getPersonalities.cancel();
      const prev = utils.trustclaw.getPersonalities.getData();
      utils.trustclaw.getPersonalities.setData(undefined, (old) =>
        old
          ? { ...old, activePersonalityId: input.activePersonalityId ?? null }
          : old,
      );
      return { prev };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.prev) {
        utils.trustclaw.getPersonalities.setData(undefined, ctx.prev);
      }
      trpcToastOnError(error);
    },
    onSettled: () => void utils.trustclaw.getPersonalities.invalidate(),
  });

  if (!data || data.personalities.length === 0) {
    return null;
  }

  return (
    <Select
      value={data.activePersonalityId ?? DEFAULT_VOICE}
      disabled={updateSettings.isPending}
      onValueChange={(value) => {
        const duringCall = liveCallActive;
        const name =
          value === DEFAULT_VOICE
            ? "The default voice"
            : (data.personalities.find((p) => p.id === value)?.name ??
              "That personality");
        void updateSettings
          .mutateAsync({
            activePersonalityId: value === DEFAULT_VOICE ? null : value,
          })
          .then(() => {
            if (duringCall) {
              showInfoToast(
                `The voice on this call won't change. ${name} applies to your next call.`,
              );
            }
          })
          .catch(() => undefined); // onError already toasts the failure
      }}
    >
      <SelectTrigger className="h-9 w-[130px] sm:w-[150px]" aria-label="Personality">
        <SelectValue placeholder="Personality" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={DEFAULT_VOICE}>
          <span className="text-muted-foreground">Default voice</span>
        </SelectItem>
        {data.personalities.map((personality) => (
          <SelectItem key={personality.id} value={personality.id}>
            <span className="flex items-center gap-2">
              <PersonalityAvatar avatarKey={personality.avatarKey} size={20} />
              {personality.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
