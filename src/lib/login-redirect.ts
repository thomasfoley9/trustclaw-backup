// Shared handling for the /login?next=<path> deep-link param.

// Only same-origin absolute paths are honored: "/x" yes, "//evil.com" and
// "https://evil.com" no (open-redirect guard).
export function safeNextPath(
  next: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return fallback;
}

export function loginPathWithNext(currentPath: string): string {
  if (!currentPath || currentPath === "/dashboard") return "/login";
  return `/login?next=${encodeURIComponent(currentPath)}`;
}
