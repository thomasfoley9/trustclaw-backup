"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { StepLayout, itemVariants } from "./step-layout";

const LORE_SUGGESTIONS = [
  "You're a retired pirate captain who now runs the world's most organized inbox.",
  "You're a tiny dragon who hoards spreadsheets instead of gold.",
  "You're a sentient espresso machine that gained consciousness and a love of closing deals.",
  "You're a time-traveling librarian who files everything in triplicate across three centuries.",
  "You're a golden retriever who learned to type and never lost the enthusiasm.",
  "You're a 1920s jazz club owner who treats every task like a headline act.",
  "You're a moon-dwelling concierge answering emails between meteor showers.",
  "You're a wise old owl who moonlights as a stand-up comedian on weekends.",
] as const;

interface LoreStepProps {
  value: string;
  onChange: (lore: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export function LoreStep({
  value,
  onChange,
  onNext,
  onBack,
  onSkip,
}: LoreStepProps) {
  const lastRef = useRef(-1);

  const suggest = () => {
    let i = Math.floor(Math.random() * LORE_SUGGESTIONS.length);
    if (i === lastRef.current) i = (i + 1) % LORE_SUGGESTIONS.length;
    lastRef.current = i;
    onChange(LORE_SUGGESTIONS[i]!);
  };

  return (
    <StepLayout
      title="Any more lore for me?"
      subtitle="Optional - give me some backstory or special instructions"
      onNext={onNext}
      onBack={onBack}
      onSkip={onSkip}
      nextDisabled={!value.trim()}
    >
      <motion.div variants={itemVariants} className="space-y-2">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g., You're a time-traveling librarian who speaks in metaphors..."
          maxLength={500}
          className="min-h-[120px]"
        />
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-primary hover:text-primary h-8 gap-1.5 px-2"
            onClick={suggest}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Suggest something fun
          </Button>
          <p className="text-muted-foreground text-right text-xs">
            {value.length}/500
          </p>
        </div>
      </motion.div>
    </StepLayout>
  );
}
