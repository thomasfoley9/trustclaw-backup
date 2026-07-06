"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { z } from "zod";
import { trpc } from "~/clients/trpc";
import { showTrpcErrorToast } from "~/components/core/toast-notifications";
import { ErrorBoundary } from "~/components/core/error-boundary";
import { Button } from "~/components/ui/button";
import { onboardingModelSchema } from "~/server/api/routers/trustclaw/createInstance.schema";
import {
  STEP_ORDER,
  WRITING_STYLES,
  PERSONALITIES,
  WRITING_STYLE_ITEM_MAP,
  PERSONALITY_OUTFIT_MAP,
  type Step,
  type WritingStyleKey,
  type PersonalityKey,
} from "./onboarding.consts";
import { OnboardingClawLogo } from "./onboarding-claw-logo";
import { NameStep } from "./name-step";
import { WritingStyleStep } from "./writing-style-step";
import { PersonalityStep } from "./personality-step";
import { EmojiStep } from "./emoji-step";
import { LoreStep } from "./lore-step";
import { ModelStep } from "./model-step";
import { IntegrationsStep } from "./integrations-step";
import { TelegramStep } from "./telegram-step";
import { ProgressDots } from "./progress-dots";
import { containerVariants, itemVariants } from "./onboarding.variants";

type AnimationState =
  | "idle"
  | "happy"
  | "thinking"
  | "celebrating"
  | "listening";

interface OnboardingWizardState {
  name: string;
  writingStyle: WritingStyleKey | null;
  funWritingStyle: WritingStyleKey | null;
  personality: PersonalityKey | null;
  emoji: string | null;
  lore: string;
  anthropicModel: z.infer<typeof onboardingModelSchema>;
  // In-memory only - never persisted to onboardingState (it's a secret).
  anthropicApiKey: string;
}

function getAnimationState(step: Step): AnimationState {
  switch (step) {
    case "name":
      return "happy";
    case "writing-style":
      return "idle";
    case "personality":
      return "idle";
    case "emoji":
      return "celebrating";
    case "lore":
      return "listening";
    case "model":
      return "thinking";
    case "integrations":
      return "celebrating";
    case "telegram":
      return "idle";
  }
}

interface SavedOnboardingState {
  currentStep: string;
  name: string;
  writingStyle: string | null;
  funWritingStyle: string | null;
  personality: string | null;
  emoji: string | null;
  lore: string;
  anthropicModel: string;
}

interface OnboardingProps {
  onComplete: () => void;
  hasExistingInstance?: boolean;
  savedState?: SavedOnboardingState | null;
}

function isValidStep(s: string): s is Step {
  return (STEP_ORDER satisfies readonly Step[]).some((step) => step === s);
}

export function Onboarding({
  onComplete,
  hasExistingInstance = false,
  savedState,
}: OnboardingProps) {
  const initialStep: Step =
    savedState?.currentStep && isValidStep(savedState.currentStep)
      ? savedState.currentStep
      : "name";

  const [step, setStep] = useState<Step>(initialStep);
  const [wizardState, setWizardState] = useState<OnboardingWizardState>(() => {
    const parsedModel = onboardingModelSchema.safeParse(
      savedState?.anthropicModel,
    );
    return {
      name: savedState?.name ?? "",
      writingStyle:
        WRITING_STYLES.find((s) => s.key === savedState?.writingStyle)?.key ??
        null,
      funWritingStyle:
        WRITING_STYLES.find((s) => s.key === savedState?.funWritingStyle)
          ?.key ?? null,
      personality:
        PERSONALITIES.find((p) => p.key === savedState?.personality)?.key ??
        null,
      emoji: savedState?.emoji ?? null,
      lore: savedState?.lore ?? "",
      anthropicModel: parsedModel.success
        ? parsedModel.data
        : "claude-sonnet-5",
      anthropicApiKey: "",
    };
  });

  const savedStepIndex =
    savedState?.currentStep && isValidStep(savedState.currentStep)
      ? STEP_ORDER.indexOf(savedState.currentStep)
      : -1;
  const [instanceCreated, setInstanceCreated] = useState(
    hasExistingInstance || savedStepIndex > STEP_ORDER.indexOf("model"),
  );

  const utils = trpc.useUtils();

  const { data: statusData } = trpc.trustclaw.getStatus.useQuery();
  // Default FALSE while getStatus is unresolved: routing a user into the
  // telegram step on a deployment without a bot renders a blank dead end.
  const telegramConfigured = statusData?.telegramConfigured ?? false;

  // Whether a key is actually on the instance - instanceCreated is NOT a
  // proxy for this (key validation can fail after the instance exists, and
  // the wizard would then falsely show "already saved" and let the user
  // finish keyless on a Claude model).
  const { data: keyStatus } = trpc.trustclaw.getAnthropicKeyStatus.useQuery();

  const createInstance = trpc.trustclaw.createInstance.useMutation({
    onSuccess: () => {
      void utils.trustclaw.getInstance.invalidate();
      void utils.trustclaw.getPersonalities.invalidate();
    },
  });

  const setAnthropicKey = trpc.trustclaw.setAnthropicApiKey.useMutation({
    onSuccess: () =>
      void utils.trustclaw.getAnthropicKeyStatus.invalidate(),
  });

  const updateModel = trpc.trustclaw.updateSettings.useMutation();

  const saveState = trpc.trustclaw.saveOnboardingState.useMutation();

  const persistState = async (
    nextStep: Step,
    currentWizardState: OnboardingWizardState,
  ) => {
    await saveState.mutateAsync({
      currentStep: nextStep,
      name: currentWizardState.name,
      writingStyle: currentWizardState.writingStyle,
      funWritingStyle: currentWizardState.funWritingStyle,
      personality: currentWizardState.personality,
      emoji: currentWizardState.emoji,
      lore: currentWizardState.lore,
      anthropicModel: currentWizardState.anthropicModel,
    });
  };

  const goToStep = (nextStep: Step) => {
    setStep(nextStep);
    void persistState(nextStep, wizardState);
  };

  const goBack = () => {
    const currentIndex = STEP_ORDER.indexOf(step);
    if (currentIndex > 0) {
      const prevStep = STEP_ORDER[currentIndex - 1]!;
      setStep(prevStep);
      void persistState(prevStep, wizardState);
    }
  };

  const handleModelNext = async () => {
    const key = wizardState.anthropicApiKey.trim();
    const isHouse = wizardState.anthropicModel.startsWith("house/");
    try {
      if (!instanceCreated) {
        // The instance bakes identity/soul prompts from onboardingState, so
        // the state write must COMMIT first - the per-step persists are
        // fire-and-forget and can lose the race on slow connections.
        await persistState("model", wizardState);
        await createInstance.mutateAsync({
          anthropicModel: wizardState.anthropicModel,
        });
        setInstanceCreated(true);
      } else {
        // Returning to this step after the instance exists: keep the
        // instance's model in sync with the wizard selection instead of
        // silently ignoring the change.
        await updateModel.mutateAsync({
          anthropicModel: wizardState.anthropicModel,
        });
      }
      // Validate + save the user's Anthropic key. Not needed for house models
      // (owner-funded), and skippable if one is already on the instance.
      if (!isHouse && key) {
        await setAnthropicKey.mutateAsync({ apiKey: key });
      }
      goToStep("integrations");
    } catch (error) {
      showTrpcErrorToast(error);
    }
  };

  // "Skip - start free": no Anthropic key, land on the default house model so
  // chat works immediately. If the instance already exists (a previous pass
  // through this step), skipping just moves on without touching its model.
  const handleModelSkip = async () => {
    try {
      if (!instanceCreated) {
        const nextState: OnboardingWizardState = {
          ...wizardState,
          anthropicModel: "house/kimi-k2",
        };
        // Commit the wizard state before the instance bakes prompts from it.
        await persistState("model", nextState);
        await createInstance.mutateAsync({ anthropicModel: "house/kimi-k2" });
        setInstanceCreated(true);
        setWizardState(nextState);
        setStep("integrations");
        void persistState("integrations", nextState);
        return;
      }
      goToStep("integrations");
    } catch (error) {
      showTrpcErrorToast(error);
    }
  };

  const handleComplete = () => {
    onComplete();
  };

  // A persisted currentStep of "telegram" on a deployment without a bot would
  // render nothing forever - finish onboarding instead (fires once).
  const autoCompletedRef = useRef(false);
  useEffect(() => {
    if (
      step === "telegram" &&
      statusData &&
      !statusData.telegramConfigured &&
      !autoCompletedRef.current
    ) {
      autoCompletedRef.current = true;
      onComplete();
    }
  }, [step, statusData, onComplete]);

  const writingStyleItem = wizardState.writingStyle
    ? (WRITING_STYLE_ITEM_MAP[wizardState.writingStyle] ?? null)
    : null;

  const personalityOutfit = wizardState.personality
    ? (PERSONALITY_OUTFIT_MAP[wizardState.personality] ?? null)
    : null;

  if (createInstance.isPending || setAnthropicKey.isPending) {
    return (
      <div className="flex h-full items-start justify-center p-4 pt-12 md:pt-20">
        <div className="w-full max-w-lg">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="space-y-6 text-center"
          >
            <motion.div variants={itemVariants}>
              <Loader2 className="text-primary mx-auto h-10 w-10 animate-spin" />
              <h2 className="mt-4 text-xl font-semibold tracking-tight">
                Setting things up...
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Setting up your instance and validating your Anthropic key
              </p>
            </motion.div>
            {(createInstance.isError || setAnthropicKey.isError) && (
              <motion.div variants={itemVariants}>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => void handleModelNext()}
                >
                  Retry
                </Button>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-full items-start justify-center p-4 pt-12 md:pt-20">
      <div
        className="ambient-glow pointer-events-none absolute inset-0"
        aria-hidden
      />
      <div className="relative w-full max-w-lg">
        <div className="mb-6 flex flex-col items-center">
          <OnboardingClawLogo
            name={wizardState.name || null}
            writingStyleItem={writingStyleItem}
            personalityOutfit={personalityOutfit}
            emoji={wizardState.emoji}
            animationState={getAnimationState(step)}
          />
        </div>

        <ProgressDots current={STEP_ORDER.indexOf(step) + 1} />

        <AnimatePresence mode="wait">
          {step === "name" && (
            <NameStep
              key="name"
              value={wizardState.name}
              onChange={(name) => setWizardState((prev) => ({ ...prev, name }))}
              onNext={() => goToStep("writing-style")}
            />
          )}

          {step === "writing-style" && (
            <WritingStyleStep
              key="writing-style"
              professional={wizardState.writingStyle}
              fun={wizardState.funWritingStyle}
              onChangeProfessional={(writingStyle) =>
                setWizardState((prev) => ({ ...prev, writingStyle }))
              }
              onChangeFun={(funWritingStyle) =>
                setWizardState((prev) => ({ ...prev, funWritingStyle }))
              }
              onNext={() => goToStep("personality")}
              onBack={goBack}
            />
          )}

          {step === "personality" && (
            <PersonalityStep
              key="personality"
              value={wizardState.personality}
              onChange={(personality) =>
                setWizardState((prev) => ({ ...prev, personality }))
              }
              onNext={() => goToStep("emoji")}
              onBack={goBack}
            />
          )}

          {step === "emoji" && (
            <EmojiStep
              key="emoji"
              value={wizardState.emoji}
              onChange={(emoji) =>
                setWizardState((prev) => ({ ...prev, emoji }))
              }
              onNext={() => goToStep("lore")}
              onBack={goBack}
            />
          )}

          {step === "lore" && (
            <LoreStep
              key="lore"
              value={wizardState.lore}
              onChange={(lore) => setWizardState((prev) => ({ ...prev, lore }))}
              onNext={() => goToStep("model")}
              onBack={goBack}
              onSkip={() => goToStep("model")}
            />
          )}

          {step === "model" && (
            <ModelStep
              key="model"
              value={wizardState.anthropicModel}
              onChange={(anthropicModel) =>
                setWizardState((prev) => ({ ...prev, anthropicModel }))
              }
              apiKey={wizardState.anthropicApiKey}
              onApiKeyChange={(anthropicApiKey) =>
                setWizardState((prev) => ({ ...prev, anthropicApiKey }))
              }
              keyAlreadySet={keyStatus?.hasKey ?? false}
              saving={
                createInstance.isPending ||
                setAnthropicKey.isPending ||
                updateModel.isPending
              }
              onNext={() => void handleModelNext()}
              onBack={goBack}
              onSkip={() => void handleModelSkip()}
            />
          )}

          {step === "integrations" && instanceCreated && (
            <ErrorBoundary>
              <IntegrationsStep
                key="integrations"
                onNext={() =>
                  telegramConfigured ? goToStep("telegram") : handleComplete()
                }
                onBack={goBack}
                onSkip={() =>
                  telegramConfigured ? goToStep("telegram") : handleComplete()
                }
              />
            </ErrorBoundary>
          )}

          {step === "telegram" && telegramConfigured && (
            <TelegramStep
              key="telegram"
              onBack={goBack}
              onSkip={() => {
                void handleComplete();
              }}
              onComplete={() => void handleComplete()}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
