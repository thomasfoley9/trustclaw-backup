"use client";

import dynamic from "next/dynamic";
import { trpc } from "~/clients/trpc";
import Link from "next/link";
import { ErrorDisplay } from "~/components/core/error-display";
import { ErrorBoundary } from "~/components/core/error-boundary";
import { ModelSettings } from "./model-settings";
import { ComposioApiKeySettings } from "./composio-api-key-settings";
import { AnthropicApiKeySettings } from "./anthropic-api-key-settings";
import { VoiceSettings } from "./voice-settings";
import { TelegramSettings } from "./telegram-settings";
import { TimezoneSettings } from "./timezone-settings";
import { RerunSetup } from "./rerun-setup";
import { DangerZone } from "./danger-zone";
import { SettingsPageSkeleton } from "./settings-page.skeleton";
import { CustomModelsSettingsSkeleton } from "./custom-models-settings.skeleton";
import { McpServersSettingsSkeleton } from "./mcp-servers-settings.skeleton";
import { PersonalitySettingsSkeleton } from "./personality-settings.skeleton";
import { SkillsSettingsSkeleton } from "./skills-settings.skeleton";
import { CronJobsSettingsSkeleton } from "./cron-jobs-settings.skeleton";
import { KnowledgeBucketsSettingsSkeleton } from "./knowledge-buckets-settings.skeleton";
import { MemorySettingsSkeleton } from "./memory-settings.skeleton";

// The heavy below-the-fold cards are code-split so the settings route's
// initial bundle carries only the top-of-page sections; each split card
// streams in behind its existing skeleton.
const CustomModelsSettings = dynamic(
  () => import("./custom-models-settings").then((m) => m.CustomModelsSettings),
  { loading: () => <CustomModelsSettingsSkeleton /> },
);
const McpServersSettings = dynamic(
  () => import("./mcp-servers-settings").then((m) => m.McpServersSettings),
  { loading: () => <McpServersSettingsSkeleton /> },
);
const PersonalitySettings = dynamic(
  () => import("./personality-settings").then((m) => m.PersonalitySettings),
  { loading: () => <PersonalitySettingsSkeleton /> },
);
const SkillsSettings = dynamic(
  () => import("./skills-settings").then((m) => m.SkillsSettings),
  { loading: () => <SkillsSettingsSkeleton /> },
);
const CronJobsSettings = dynamic(
  () => import("./cron-jobs-settings").then((m) => m.CronJobsSettings),
  { loading: () => <CronJobsSettingsSkeleton /> },
);
const KnowledgeBucketsSettings = dynamic(
  () =>
    import("./knowledge-buckets-settings").then(
      (m) => m.KnowledgeBucketsSettings,
    ),
  { loading: () => <KnowledgeBucketsSettingsSkeleton /> },
);
const MemorySettings = dynamic(
  () => import("./memory-settings").then((m) => m.MemorySettings),
  { loading: () => <MemorySettingsSkeleton /> },
);

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
          <p className="text-muted-foreground">No Claw instance found.</p>
          <Link
            href="/dashboard"
            className="text-primary mt-2 inline-block hover:underline"
          >
            Go to Claw
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
          Shape your agent - its brain, voice, models, and what it can do.
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
        <TimezoneSettings currentTimezone={data?.timezone ?? "UTC"} />
      </ErrorBoundary>

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
        <RerunSetup />
      </ErrorBoundary>

      <ErrorBoundary>
        <DangerZone />
      </ErrorBoundary>
    </div>
  );
}
