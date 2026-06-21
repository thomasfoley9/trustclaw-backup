"use client";

import { trpc } from "~/clients/trpc";
import Link from "next/link";
import { ErrorDisplay } from "~/components/core/error-display";
import { ErrorBoundary } from "~/components/core/error-boundary";
import { ModelSettings } from "./model-settings";
import { CustomModelsSettings } from "./custom-models-settings";
import { McpServersSettings } from "./mcp-servers-settings";
import { ComposioApiKeySettings } from "./composio-api-key-settings";
import { AnthropicApiKeySettings } from "./anthropic-api-key-settings";
import { VoiceSettings } from "./voice-settings";
import { TelegramSettings } from "./telegram-settings";
import { CronJobsSettings } from "./cron-jobs-settings";
import { MemorySettings } from "./memory-settings";
import { KnowledgeBucketsSettings } from "./knowledge-buckets-settings";
import { PersonalitySettings } from "./personality-settings";
import { SkillsSettings } from "./skills-settings";
import { DangerZone } from "./danger-zone";
import { SettingsPageSkeleton } from "./settings-page.skeleton";

export function SettingsPageClient() {
  const { data, isLoading, error } = trpc.trustclaw.getInstance.useQuery();
  const instance = data?.instance ?? null;

  if (isLoading) {
    return <SettingsPageSkeleton />;
  }

  if (error) {
    return (
      <ErrorDisplay
        message={error.message}
        retryText="Try again"
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (!instance) {
    return (
      <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
        <div className="text-center">
          <p className="text-muted-foreground">No Thomas Claw instance found.</p>
          <Link
            href="/dashboard"
            className="text-primary mt-2 inline-block hover:underline"
          >
            Go to Thomas Claw
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4 md:p-8">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">
          Settings
        </h1>
        <p className="text-muted-foreground text-sm">
          Shape your agent — its brain, voice, models, and what it can do.
        </p>
      </div>

      <ErrorBoundary>
        <AnthropicApiKeySettings />
      </ErrorBoundary>

      <ErrorBoundary>
        <ComposioApiKeySettings />
      </ErrorBoundary>

      <ErrorBoundary>
        <VoiceSettings />
      </ErrorBoundary>

      <ErrorBoundary>
        <ModelSettings
          currentModel={instance.anthropicModel}
          currentAgentAModel={instance.agentAModel}
        />
      </ErrorBoundary>

      <ErrorBoundary>
        <CustomModelsSettings />
      </ErrorBoundary>

      <ErrorBoundary>
        <McpServersSettings />
      </ErrorBoundary>

      <ErrorBoundary>
        <PersonalitySettings />
      </ErrorBoundary>

      <ErrorBoundary>
        <SkillsSettings />
      </ErrorBoundary>

      {data?.telegramConfigured && (
        <ErrorBoundary>
          <TelegramSettings />
        </ErrorBoundary>
      )}

      <ErrorBoundary>
        <CronJobsSettings />
      </ErrorBoundary>

      <ErrorBoundary>
        <KnowledgeBucketsSettings />
      </ErrorBoundary>

      <ErrorBoundary>
        <MemorySettings />
      </ErrorBoundary>

      <ErrorBoundary>
        <DangerZone />
      </ErrorBoundary>
    </div>
  );
}
