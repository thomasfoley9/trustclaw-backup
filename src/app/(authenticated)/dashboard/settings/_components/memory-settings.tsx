"use client";

import { Brain, Trash2 } from "lucide-react";
import moment from "moment";
import { trpc } from "~/clients/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { trpcToastOnError } from "~/components/core/toast-notifications";

export function MemorySettings() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.trustclaw.getMemories.useQuery({
    limit: 50,
  });

  const deleteMemory = trpc.trustclaw.deleteMemory.useMutation({
    onSuccess: () => void utils.trustclaw.getMemories.invalidate(),
    onError: trpcToastOnError,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Memory</CardTitle>
        <CardDescription>
          Things your agent has remembered across conversations. Delete any you
          don&apos;t want it to keep.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Brain className="text-muted-foreground mb-2 h-8 w-8" />
            <p className="text-muted-foreground text-sm">
              No memories yet. Your agent will remember things as you chat.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {data.items.map((memory) => (
              <li
                key={memory.id}
                className="border-border bg-card flex items-start justify-between gap-2 rounded-md border p-3"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-foreground text-sm">{memory.content}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {memory.category}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {moment(memory.createdAt).fromNow()}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive h-7 w-7 shrink-0"
                  onClick={() => void deleteMemory.mutateAsync({ id: memory.id })}
                  disabled={deleteMemory.isPending}
                  aria-label="Delete memory"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
