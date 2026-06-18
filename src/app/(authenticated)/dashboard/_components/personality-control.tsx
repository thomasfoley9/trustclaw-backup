"use client";

import { trpc } from "~/clients/trpc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { trpcToastOnError } from "~/components/core/toast-notifications";
import { PersonalityAvatar } from "~/app/_components/personality-avatar";

export function PersonalityControl() {
  const utils = trpc.useUtils();
  const { data } = trpc.trustclaw.getPersonalities.useQuery();

  const updateSettings = trpc.trustclaw.updateSettings.useMutation({
    onError: trpcToastOnError,
    onSuccess: () => void utils.trustclaw.getPersonalities.invalidate(),
  });

  if (!data || data.personalities.length === 0) {
    return null;
  }

  return (
    <Select
      value={data.activePersonalityId ?? undefined}
      disabled={updateSettings.isPending}
      onValueChange={(value) =>
        void updateSettings.mutateAsync({ activePersonalityId: value })
      }
    >
      <SelectTrigger className="h-9 w-[130px] sm:w-[150px]" aria-label="Personality">
        <SelectValue placeholder="Personality" />
      </SelectTrigger>
      <SelectContent>
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
