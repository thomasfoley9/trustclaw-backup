// Shared handling for the /login?next=<path> deep-link param.

// Only same-origin absolute paths are honored: "/x" yes, "//evil.com",
// "/\evil.com", "https://evil.com" no (open-redirect guard). Browsers
// normalize backslashes to slashes, so "/\evil.com" and "\/evil.com" resolve
// to a protocol-relative host - the second character must be neither "/" nor
// "\". Control characters (which browsers strip, letting an attacker smuggle a
// host past a naive prefix check) are rejected too; the class is built from an
// escaped string so no literal control byte ever lands in the source.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]");

export function safeNextPath(
  next: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (
    next &&
    next.startsWith("/") &&
    next[1] !== "/" &&
    next[1] !== "\\" &&
    !CONTROL_CHARS.test(next)
  ) {
    return next;
  }
  return fallback;
}

export function loginPathWithNext(currentPath: string): string {
  if (!currentPath || currentPath === "/dashboard") return "/login";
  return `/login?next=${encodeURIComponent(currentPath)}`;
}
