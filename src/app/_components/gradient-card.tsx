import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

interface GradientCardProps {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}

/** Hairline gradient-border card used across the marketing sections. */
export function GradientCard({
  children,
  className,
  innerClassName,
}: GradientCardProps) {
  return (
    <div
      className={cn(
        "from-border via-border/50 h-full rounded-xl bg-linear-to-br to-transparent p-px",
        className,
      )}
    >
      <div
        className={cn(
          "bg-card flex h-full flex-col gap-4 rounded-xl p-6",
          innerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
