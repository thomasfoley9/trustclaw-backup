"use client";

import { useState } from "react";
import { Loader2, Plug, Plus, Trash2 } from "lucide-react";
import { trpc } from "~/clients/trpc";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
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

export function McpServersSettings() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.trustclaw.getMcpServers.useQuery();
  const servers = data?.servers ?? [];
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  const add = trpc.trustclaw.addMcpServer.useMutation({
    onSuccess: (res) => {
      showSuccessToast(`Connected "${res.label}" - ${res.toolCount} tools`);
      setLabel("");
      setUrl("");
      void utils.trustclaw.getMcpServers.invalidate();
    },
    onError: trpcToastOnError,
  });

  const remove = trpc.trustclaw.removeMcpServer.useMutation({
    onSuccess: () => void utils.trustclaw.getMcpServers.invalidate(),
    onError: trpcToastOnError,
  });

  const canAdd =
    label.trim().length > 0 &&
    url.trim().startsWith("https://") &&
    !add.isPending;

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
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => void remove.mutateAsync({ id: s.id })}
                  disabled={remove.isPending}
                  aria-label={`Remove ${s.label}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            No MCP servers connected yet.
          </p>
        )}

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="mcp-label">Label</Label>
              <Input
                id="mcp-label"
                placeholder="GitHub MCP"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                disabled={add.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcp-url">MCP server URL</Label>
              <Input
                id="mcp-url"
                type="password"
                autoComplete="off"
                placeholder="https://mcp.composio.dev/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={add.isPending}
              />
            </div>
          </div>
          <Button
            variant="outline"
            disabled={!canAdd}
            onClick={() =>
              void add.mutateAsync({ label: label.trim(), url: url.trim() })
            }
          >
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
        </div>
      </CardContent>
    </Card>
  );
}
