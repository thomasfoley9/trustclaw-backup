"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { trpc } from "~/clients/trpc";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { trpcToastOnError } from "~/components/core/toast-notifications";
import { AlertDialog } from "~/components/core/confirm-dialog";
import { Spinner } from "~/components/ui/spinner";

export function RerunSetup() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const restart = trpc.trustclaw.restartOnboarding.useMutation({
    onSuccess: async () => {
      await utils.trustclaw.getStatus.invalidate();
      router.push("/dashboard");
      router.refresh();
    },
    onError: trpcToastOnError,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4" />
          Setup wizard
        </CardTitle>
        <CardDescription>
          Walk through the setup wizard again to rename your agent or change
          its style, personality, or model.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">
            Nothing is deleted - your chats, memories, keys, and connections
            all stay put.
          </p>
          <AlertDialog
            title="Re-run setup?"
            description="You'll go back through the setup wizard with your previous answers filled in. Nothing will be deleted - all chats, memories, keys, and connections are kept."
            confirmLabel="Re-run setup"
            confirmVariant="default"
            onConfirm={async () => {
              await restart.mutateAsync();
            }}
            isPending={restart.isPending}
            trigger={
              <Button variant="outline" disabled={restart.isPending}>
                {restart.isPending ? (
                  <Spinner className="mr-2" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                Re-run setup
              </Button>
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
