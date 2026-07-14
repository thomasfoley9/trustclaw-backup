"use client";

import { useEffect, useState } from "react";
import { Globe, Loader2 } from "lucide-react";
import { trpc } from "~/clients/trpc";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  showSuccessToast,
  trpcToastOnError,
} from "~/components/core/toast-notifications";

// Short common list for runtimes without Intl.supportedValuesOf (widely
// available since 2022, but the fallback keeps the card usable everywhere).
const FALLBACK_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function supportedTimezones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return FALLBACK_TIMEZONES;
  }
}

function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

export function TimezoneSettings({
  currentTimezone,
}: {
  currentTimezone: string;
}) {
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState(currentTimezone);
  // Re-sync if the saved value changes under us (e.g. another tab saved).
  useEffect(() => setSelected(currentTimezone), [currentTimezone]);

  const [timezones] = useState(supportedTimezones);
  // Make sure the saved value is always selectable, even if the runtime's
  // zone list doesn't include it.
  const options = timezones.includes(currentTimezone)
    ? timezones
    : [currentTimezone, ...timezones];

  const detected = deviceTimezone();

  const updateSettings = trpc.trustclaw.updateSettings.useMutation({
    onSuccess: () => {
      showSuccessToast("Timezone saved");
      void utils.trustclaw.getInstance.invalidate();
    },
    onError: trpcToastOnError,
  });

  const hasChanges = selected !== currentTimezone;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Timezone
        </CardTitle>
        <CardDescription>
          Scheduled tasks and anything time-based run in this timezone. Without
          it, &quot;daily at 8am&quot; means 8am UTC.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor="timezone-select">Your timezone</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger id="timezone-select" className="w-full sm:w-72">
              <SelectValue placeholder="Pick a timezone" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {options.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz.replaceAll("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={!hasChanges || updateSettings.isPending}
            onClick={() =>
              void updateSettings.mutateAsync({ timezone: selected })
            }
          >
            {updateSettings.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
        {detected && detected !== selected && (
          <button
            type="button"
            className="text-primary text-xs underline-offset-4 hover:underline"
            onClick={() => setSelected(detected)}
          >
            Use device timezone ({detected.replaceAll("_", " ")})
          </button>
        )}
        <p className="text-muted-foreground text-xs">
          New scheduled tasks default to this zone; existing ones keep the zone
          they were created with.
        </p>
      </CardContent>
    </Card>
  );
}
