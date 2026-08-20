import { TRPCClientError } from "@trpc/client";
import type { InferrableClientTypes } from "@trpc/server/unstable-core-do-not-import";

const CODE_DESCRIPTIONS: Record<string, string> = {
  UNAUTHORIZED: "Please log in again",
  FORBIDDEN: "You don't have permission to do this",
  NOT_FOUND: "The requested resource was not found",
  CONFLICT: "This resource already exists",
  TOO_MANY_REQUESTS: "Please wait a moment and try again",
  TIMEOUT: "The request timed out - please try again",
  INTERNAL_SERVER_ERROR: "Something went wrong on our end",
};

export function isTrpcError(
  error: unknown,
): error is TRPCClientError<InferrableClientTypes> {
  return error instanceof TRPCClientError;
}

export function parseTrpcError(error: unknown): {
  title: string;
  description?: string;
} {
  const defaultMessage =
    "Something went wrong. Our team has been notified and we are on it!";

  if (isTrpcError(error)) {
    const code = (error.data as Record<string, unknown> | undefined)?.code as
      | string
      | undefined;
    // Prefer the server's own message - our procedures throw user-facing
    // messages (e.g. "Anthropic rejected this API key", "out of credits").
    // Fall back to a code-based generic only when there's no useful message.
    const serverMessage =
      typeof error.message === "string" ? error.message.trim() : "";
    if (serverMessage && serverMessage !== code && serverMessage.length <= 300) {
      return { title: serverMessage };
    }
    const friendlyTitle =
      (code ? CODE_DESCRIPTIONS[code] : undefined) ?? defaultMessage;

    return { title: friendlyTitle };
  }

  return { title: defaultMessage };
}

// Only fire one redirect no matter how many parallel calls hit 401.
let loginRedirectScheduled = false;

// An expired session means every subsequent call fails too - "Please log in
// again" alone strands the user, so send them to /login with a deep link back.
export function redirectToLoginOnUnauthorized(error: unknown) {
  if (typeof window === "undefined" || loginRedirectScheduled) return;
  if (!isTrpcError(error)) return;
  const code = (error.data as Record<string, unknown> | undefined)?.code;
  if (code !== "UNAUTHORIZED") return;
  if (window.location.pathname.startsWith("/login")) return;
  loginRedirectScheduled = true;
  const next = window.location.pathname + window.location.search;
  // Brief pause so the toast is readable before the full-page navigation.
  // window.location (not useRouter) because this isn't a component - there's
  // no hook context to reach the router from here.
  setTimeout(() => {
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  }, 1500);
}
