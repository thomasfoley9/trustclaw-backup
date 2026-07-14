"use client";

import { motion } from "framer-motion";
import { cn } from "~/lib/utils";
import type { z } from "zod";
import { onboardingModelSchema } from "~/server/api/routers/trustclaw/createInstance.schema";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { MODELS, HOUSE_MODELS } from "./onboarding.consts";
import { StepLayout, itemVariants } from "./step-layout";

type OnboardingModel = z.infer<typeof onboardingModelSchema>;

interface ModelStepProps {
  value: OnboardingModel;
  onChange: (model: OnboardingModel) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  keyAlreadySet?: boolean;
  saving?: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

interface ModelOption {
  value: OnboardingModel;
  label: string;
  description: string;
  cost: string;
}

function ModelGrid({
  options,
  value,
  onSelect,
}: {
  options: readonly ModelOption[];
  value: OnboardingModel;
  onSelect: (model: OnboardingModel) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3">
      {options.map((model) => (
        <button
          key={model.value}
          onClick={() => onSelect(model.value)}
          className={cn(
            "flex min-h-[44px] items-center justify-between rounded-lg border p-4 text-left transition-all",
            value === model.value
              ? "border-primary ring-primary ring-2"
              : "border-border hover:border-primary/50",
          )}
        >
          <div>
            <p className="text-sm font-medium">{model.label}</p>
            <p className="text-muted-foreground text-xs">{model.description}</p>
          </div>
          <span className="text-muted-foreground text-sm font-medium">
            {model.cost}
          </span>
        </button>
      ))}
    </div>
  );
}

export function ModelStep({
  value,
  onChange,
  apiKey,
  onApiKeyChange,
  keyAlreadySet = false,
  saving = false,
  onNext,
  onBack,
  onSkip,
}: ModelStepProps) {
  const handleModelChange = (val: string) => {
    const model = onboardingModelSchema.safeParse(val);
    if (!model.success) return;
    onChange(model.data);
  };

  const isHouse = value.startsWith("house/");
  const keyOk = apiKey.trim().length >= 20;
  const nextDisabled = saving || (!isHouse && !keyAlreadySet && !keyOk);

  return (
    <StepLayout
      title="Choose my brain!"
      subtitle="Free house models work instantly - or bring your own Anthropic key for Claude"
      onNext={onNext}
      onBack={onBack}
      onSkip={onSkip}
      skipLabel="Skip - start free"
      nextDisabled={nextDisabled}
    >
      <motion.div variants={itemVariants} className="space-y-2 text-left">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Free - no key needed
        </p>
        <ModelGrid
          options={HOUSE_MODELS}
          value={value}
          onSelect={handleModelChange}
        />
      </motion.div>

      <motion.div variants={itemVariants} className="space-y-2 text-left">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Claude - bring your own key
        </p>
        <ModelGrid options={MODELS} value={value} onSelect={handleModelChange} />
      </motion.div>

      {isHouse ? (
        <motion.div variants={itemVariants} className="text-left">
          <p className="text-muted-foreground text-xs">
            No API key needed - this one runs on the house. You can add an
            Anthropic key later in Settings to unlock the Claude models.
          </p>
        </motion.div>
      ) : (
        <motion.div variants={itemVariants} className="space-y-2 text-left">
          <Label htmlFor="onboarding-anthropic-key">
            Your Anthropic API key
          </Label>
          <Input
            id="onboarding-anthropic-key"
            type="password"
            autoComplete="off"
            placeholder={keyAlreadySet ? "•••• already saved" : "sk-ant-…"}
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            Your Claude usage bills to your own account. Grab a key from the{" "}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary underline-offset-4 hover:underline"
            >
              Anthropic console
            </a>
            . We validate it before continuing. Stored encrypted (AES-256-GCM);
            only this instance can read it.
          </p>
        </motion.div>
      )}
    </StepLayout>
  );
}
