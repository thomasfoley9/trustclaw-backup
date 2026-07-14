"use client";

import { motion } from "framer-motion";
import { Briefcase, PartyPopper } from "lucide-react";
import { cn } from "~/lib/utils";
import { WRITING_STYLES, type WritingStyleKey } from "./onboarding.consts";
import { StepLayout, itemVariants } from "./step-layout";

interface WritingStyleStepProps {
  professional: WritingStyleKey | null;
  fun: WritingStyleKey | null;
  onChangeProfessional: (style: WritingStyleKey) => void;
  onChangeFun: (style: WritingStyleKey) => void;
  onNext: () => void;
  onBack: () => void;
}

function StylePicker({
  selected,
  onSelect,
}: {
  selected: WritingStyleKey | null;
  onSelect: (style: WritingStyleKey) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {WRITING_STYLES.map((style) => (
        <button
          key={style.key}
          onClick={() => onSelect(style.key)}
          className={cn(
            "min-h-[44px] cursor-pointer rounded-lg border p-4 text-left transition-all duration-fast ease-out-quad",
            selected === style.key
              ? "border-primary ring-primary ring-2"
              : "border-border hover:border-primary/50",
          )}
        >
          <p className="text-sm font-medium">{style.label}</p>
        </button>
      ))}
    </div>
  );
}

export function WritingStyleStep({
  professional,
  fun,
  onChangeProfessional,
  onChangeFun,
  onNext,
  onBack,
}: WritingStyleStepProps) {
  return (
    <StepLayout
      title="How should I write?"
      subtitle="Set up two voices - I'll switch between them depending on the moment"
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!professional || !fun}
    >
      <motion.div variants={itemVariants} className="space-y-2">
        <div className="flex items-center gap-2">
          <Briefcase className="text-muted-foreground size-4" aria-hidden />
          <p className="text-sm font-medium">
            Professional voice
            <span className="text-muted-foreground ml-1.5 font-normal">
              · for work & anything serious
            </span>
          </p>
        </div>
        <StylePicker selected={professional} onSelect={onChangeProfessional} />
      </motion.div>

      <motion.div variants={itemVariants} className="space-y-2">
        <div className="flex items-center gap-2">
          <PartyPopper className="text-muted-foreground size-4" aria-hidden />
          <p className="text-sm font-medium">
            Fun voice
            <span className="text-muted-foreground ml-1.5 font-normal">
              · for casual chat & good vibes
            </span>
          </p>
        </div>
        <StylePicker selected={fun} onSelect={onChangeFun} />
      </motion.div>
    </StepLayout>
  );
}
