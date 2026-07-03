"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // This is the last-resort boundary - never swallow the error, or crashes
    // become undebuggable. Log the full object + surface the message below.
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            gap: "1rem",
            padding: "1rem",
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
          }}
        >
          <h2>Something went wrong</h2>
          {error?.message ? (
            <pre
              style={{
                maxWidth: 640,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                fontSize: 12,
                color: "#888",
                margin: 0,
              }}
            >
              {error.message}
            </pre>
          ) : null}
          {error?.digest ? (
            <p style={{ fontSize: 12, color: "#aaa", margin: 0 }}>
              digest: {error.digest}
            </p>
          ) : null}
          <button type="button" onClick={() => reset()}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
