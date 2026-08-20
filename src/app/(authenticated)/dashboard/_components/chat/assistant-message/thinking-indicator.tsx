"use client";

import { useState, useEffect } from "react";
import { THINKING_WORDS } from "./thinking-words";

export function ThinkingIndicator() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % THINKING_WORDS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="py-2" role="status">
      {/* The rotating word is decorative flavor; announce a stable label
          instead of re-reading every 2.5s tick. */}
      <span className="sr-only">Assistant is thinking</span>
      <span
        aria-hidden="true"
        className="text-muted-foreground animate-pulse text-sm font-medium"
      >
        {THINKING_WORDS[index]}...
      </span>
    </div>
  );
}
