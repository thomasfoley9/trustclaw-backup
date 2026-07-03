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
      <body
        style={{
          margin: 0,
          background: "#0b0b0d",
          color: "#e7e7ea",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            gap: "1.25rem",
            padding: "1.5rem",
            textAlign: "center",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
            Something went wrong
          </h2>
          <p
            style={{
              margin: 0,
              maxWidth: 420,
              fontSize: 14,
              lineHeight: 1.5,
              color: "#a1a1aa",
            }}
          >
            The app hit an unexpected error. Try again, and if it keeps
            happening, refresh the page.
          </p>
          {error?.digest ? (
            <p style={{ fontSize: 12, color: "#71717a", margin: 0 }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              border: "none",
              borderRadius: 12,
              padding: "0.6rem 1.25rem",
              fontSize: 14,
              fontWeight: 500,
              color: "#fff",
              cursor: "pointer",
              background: "linear-gradient(120deg, #7c5cff, #3aa0e3)",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
