"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plug, Plus, Trash2 } from "lucide-react";
import { trpc } from "~/clients/trpc";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import {
  showSuccessToast,
  trpcToastOnError,
} from "~/components/core/toast-notifications";
import { ErrorDisplay } from "~/components/core/error-display";
import { AlertDialog } from "~/components/core/confirm-dialog";
import {
  addMcpServerInput,
  type AddMcpServerInput,
} from "~/server/api/routers/trustclaw/addMcpServer.schema";

export function McpServersSettings() {
  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } =
    trpc.trustclaw.getMcpServers.useQuery();
  const servers = data?.servers ?? [];

  const form = useForm<AddMcpServerInput>({
    resolver: zodResolver(addMcpServerInput),
    defaultValues: { label: "", url: "" },
  });

  const add = trpc.trustclaw.addMcpServer.useMutation({
    onSuccess: (res) => {
      showSuccessToast(`Connected "${res.label}" - ${res.toolCount} tools`);
      form.reset();
      void utils.trustclaw.getMcpServers.invalidate();
    },
    onError: trpcToastOnError,
  });

  const remove = trpc.trustclaw.removeMcpServer.useMutation({
    onSuccess: () => void utils.trustclaw.getMcpServers.invalidate(),
    onError: trpcToastOnError,
  });

  const onSubmit = async (values: AddMcpServerInput) => {
    try {
      await add.mutateAsync(values);
    } catch {
      // trpcToastOnError already surfaced the failure.
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="h-4 w-4" />
          MCP servers
        </CardTitle>
        <CardDescription>
          Paste a Composio (or any) MCP server URL and your agent gains its
          tools. We connect to validate it before saving, and the URL is
          encrypted at rest.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : error ? (
          <ErrorDisplay
            message="Failed to load MCP servers"
            retryText="Try again"
            onRetry={() => void refetch()}
          />
        ) : servers.length > 0 ? (
          <ul className="space-y-2">
            {servers.map((s) => (
              <li
                key={s.id}
                className="border-border bg-muted/30 flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{s.label}</p>
                  <p className="text-muted-foreground truncate font-mono text-xs">
                    {s.maskedUrl}
                  </p>
                </div>
                <AlertDialog
                  title={`Remove "${s.label}"?`}
                  description="Your agent immediately loses this server's tools. You can add it back later with the same URL."
                  confirmLabel="Remove server"
                  onConfirm={async () => {
                    await remove.mutateAsync({ id: s.id });
                  }}
                  isPending={remove.isPending}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      disabled={remove.isPending}
                      aria-label={`Remove ${s.label}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            No MCP servers connected yet.
          </p>
        )}

        <Form {...form}>
          <form
            onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
            className="space-y-3"
          >
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <FormField
                control={form.control}
                name="label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Label</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="GitHub MCP"
                        disabled={add.isPending}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>MCP server URL</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="off"
                        placeholder="https://mcp.composio.dev/…"
                        disabled={add.isPending}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" variant="outline" disabled={add.isPending}>
              {add.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting…
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Add server
                </>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
