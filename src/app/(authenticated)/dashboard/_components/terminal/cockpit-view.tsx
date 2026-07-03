"use client";

import { Loader2, Check, X, Sparkles } from "lucide-react";
import type { ChatStatus } from "ai";
import { cn } from "~/lib/utils";
import type { TerminalLogEntryData } from "./types";

// The "Live" altitude of the right pane: what the agent is doing, in human
// terms, instead of raw tool JSON. Receipts (the raw log) stays one toggle away.
const KNOWN_LABELS: Record<string, string> = {
  memory_search: "Searching memory",
  memory_save: "Saving a memory",
  schedule: "Managing your schedule",
};

function humanizeTool(name: string): string {
  if (KNOWN_LABELS[name]) return KNOWN_LABELS[name];
  // Composio ids like GMAIL_FETCH_EMAILS -> "Gmail fetch emails".
  const cleaned = name.replace(/[_-]+/g, " ").trim().toLowerCase();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : name;
}

interface CockpitViewProps {
  entries: TerminalLogEntryData[];
  status: ChatStatus;
}

export function CockpitView({ entries, status }: CockpitViewProps) {
  const working = status === "streaming" || status === "submitted";

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground/50 text-center text-xs">
          <Sparkles className="mx-auto mb-2 size-7" />
          <p>{working ? "Thinking..." : "No actions yet - just talking."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1 py-1">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex items-start gap-2.5 rounded-lg px-2 py-1.5"
        >
          <span className="mt-0.5 shrink-0">
            {entry.status === "executing" ? (
              <Loader2 className="text-primary size-4 animate-spin" />
            ) : entry.status === "error" ? (
              <X className="text-destructive size-4" />
            ) : (
              <Check className="text-chart-2 size-4" />
            )}
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 text-sm",
              entry.status === "executing"
                ? "text-foreground"
                : "text-muted-foreground",
            )}
          >
            {humanizeTool(entry.toolName)}
          </span>
        </div>
      ))}
    </div>
  );
}
