"use client";

import { useRef, useEffect, useState, type ReactNode } from "react";

interface AnimateOnViewProps {
  children: ReactNode;
  className?: string;
  animation?: string;
  delay?: number;
  duration?: number;
  once?: boolean;
  margin?: string;
  as?: "div" | "section" | "h1" | "h2" | "p" | "span";
}

/**
 * Entrance animation that is progressive-enhancement-safe:
 *
 * - "static": the server-rendered default. Fully visible, no inline styles.
 *   This is what crawlers, no-JS visitors, and reduced-motion users get, so
 *   content is never hidden behind a JS observer.
 * - "hidden": applied only after mount, only when prefers-reduced-motion is
 *   "no-preference", and only once the IntersectionObserver has confirmed the
 *   element is off-screen. Elements already in view at mount stay static and
 *   never blink out.
 * - "animating": the element entered the viewport; play the entrance.
 */
export function AnimateOnView({
  children,
  className = "",
  animation = "fade-in-up",
  delay = 0,
  duration = 0.5,
  once = true,
  margin = "-100px",
  as: Tag = "div",
}: AnimateOnViewProps) {
  const ref = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState<"static" | "hidden" | "animating">(
    "static",
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      !window.matchMedia("(prefers-reduced-motion: no-preference)").matches
    ) {
      return;
    }

    let isFirstCallback = true;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (isFirstCallback) {
          isFirstCallback = false;
          if (entry.isIntersecting) {
            // Already on screen at mount: skip the entrance entirely rather
            // than flashing the content out and back in.
            if (once) observer.disconnect();
            return;
          }
          setPhase("hidden");
          return;
        }
        if (entry.isIntersecting) {
          setPhase("animating");
          if (once) observer.disconnect();
        } else if (!once) {
          setPhase("hidden");
        }
      },
      { rootMargin: margin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [once, margin]);

  return (
    <Tag
      ref={ref as React.RefObject<never>}
      className={className}
      style={
        phase === "hidden"
          ? { opacity: 0 }
          : phase === "animating"
            ? {
                animation: `${animation} ${duration}s var(--ease-out-quad) ${delay}s both`,
              }
            : undefined
      }
    >
      {children}
    </Tag>
  );
}
