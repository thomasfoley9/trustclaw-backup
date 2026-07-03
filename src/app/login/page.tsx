import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { LoginPage } from "./_components/login-page";
import { auth } from "~/server/auth";
import { db } from "~/server/clients/db";
import { env } from "~/env";
import { ErrorDisplay } from "~/components/core/error-display";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const defaultTab = tab === "register" ? "register" : undefined;
  let session;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <ErrorDisplay
          message="We're having trouble reaching our servers. Please check your connection and try again."
          retryText="Refresh Page"
          onRetry="refresh"
        />
      </div>
    );
  }

  if (session) {
    redirect("/dashboard");
  }

  let firstTime = false;
  try {
    const userCount = await db.user.count();
    firstTime = userCount === 0;
  } catch {
    // Non-fatal: if we can't count users, default to login tab.
  }

  const googleEnabled = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const signupOpen = env.SIGNUP_RESTRICTED !== "true";

  return (
    <LoginPage
      firstTime={firstTime}
      googleEnabled={googleEnabled}
      signupOpen={signupOpen}
      defaultTab={defaultTab}
    />
  );
}
