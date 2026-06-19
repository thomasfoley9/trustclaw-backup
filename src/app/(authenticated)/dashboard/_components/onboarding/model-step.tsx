"use client";

import { motion } from "framer-motion";
import { cn } from "~/lib/utils";
import type { z } from "zod";
import { allowedAnthropicModelSchema } from "~/server/api/routers/trustclaw/createInstance.schema";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { MODELS } from "./onboarding.consts";
import { StepLayout, itemVariants } from "./step-layout";

interface ModelStepProps {
  value: z.infer<typeof allowedAnthropicModelSchema>;
  onChange: (model: z.infer<typeof allowedAnthropicModelSchema>) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  keyAlreadySet?: boolean;
  saving?: boolean;
  onNext: () => void;
  onBack: () => void;
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
}: ModelStepProps) {
  const handleModelChange = (val: string) => {
    const model = allowedAnthropicModelSchema.safeParse(val);
    if (!model.success) return;
    onChange(model.data);
  };

  const keyOk = apiKey.trim().length >= 20;
  const nextDisabled = saving || (!keyAlreadySet && !keyOk);

  return (
    <StepLayout
      title="Choose my brain!"
      subtitle="Pick a Claude model and bring your own Anthropic key"
      onNext={onNext}
      onBack={onBack}
      nextDisabled={nextDisabled}
    >
      <motion.div variants={itemVariants}>
        <div className="grid grid-cols-1 gap-3">
          {MODELS.map((model) => (
            <button
              key={model.value}
              onClick={() => handleModelChange(model.value)}
              className={cn(
                "flex min-h-[44px] items-center justify-between rounded-lg border p-4 text-left transition-all",
                value === model.value
                  ? "border-primary ring-primary ring-2"
                  : "border-border hover:border-primary/50",
              )}
            >
              <div>
                <p className="text-sm font-medium">{model.label}</p>
                <p className="text-muted-foreground text-xs">
                  {model.description}
                </p>
              </div>
              <span className="text-muted-foreground text-sm font-medium">
                {model.cost}
              </span>
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className="space-y-2 text-left">
        <Label htmlFor="onboarding-anthropic-key">Your Anthropic API key</Label>
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
          . We validate it before continuing.
        </p>
      </motion.div>
    </StepLayout>
  );
}
