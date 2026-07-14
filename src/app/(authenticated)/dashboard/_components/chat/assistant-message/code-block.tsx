"use client";

import { useState, useRef, useEffect } from "react";
import { Check, Copy } from "lucide-react";

// Fenced code block renderer for assistant markdown: horizontal scroll instead
// of wrapped (indentation-mangling) lines, plus a per-block copy button.
export function CodeBlock(props: React.HTMLAttributes<HTMLPreElement>) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleCopy = () => {
    const text = preRef.current?.innerText ?? "";
    void navigator.clipboard.writeText(text);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative">
      <pre ref={preRef} {...props} />
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy code"}
        className="border-border bg-background/80 text-muted-foreground hover:text-foreground absolute top-2 right-2 rounded-md border p-1.5 opacity-0 backdrop-blur transition-opacity duration-fast ease-out-quad group-hover:opacity-100 focus-visible:opacity-100"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}
