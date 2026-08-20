import { Suspense } from "react";
import { auth } from "~/server/auth";
import { headers } from "next/headers";
import { ErrorDisplay } from "~/components/core/error-display";
import { RedirectToLogin } from "./_components/redirect-to-login";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const reqHeaders = await headers();

  // Only the session lookup can fail with a recoverable error (DB
  // unreachable, auth service down).
  let session: Awaited<ReturnType<typeof auth.api.getSession>>;
  try {
    session = await auth.api.getSession({ headers: reqHeaders });
  } catch {
    return (
      <ErrorDisplay
        message="We're having trouble reaching our servers. Please check your connection and try again."
        onRetry="refresh"
        retryText="Refresh Page"
      />
    );
  }

  if (!session) {
    // Client redirect (not redirect("/login")): only the client knows the
    // current path, and /login?next=<path> brings the user back here after
    // signing in. Suspense keeps useSearchParams prerender-safe.
    return (
      <Suspense fallback={null}>
        <RedirectToLogin />
      </Suspense>
    );
  }

  return <>{children}</>;
}
