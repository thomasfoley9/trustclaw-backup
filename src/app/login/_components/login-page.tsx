"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TrustClawBrand } from "~/app/_components/trustclaw-brand";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { authClient } from "~/clients/auth/react";
import { showErrorToast } from "~/components/core/toast-notifications";
import {
  USERNAME_HINT,
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  validateUsername,
} from "~/lib/username";

interface LoginPageProps {
  firstTime?: boolean;
  googleEnabled?: boolean;
  // When false (SIGNUP_RESTRICTED), the invite-code field is shown. Open by default.
  signupOpen?: boolean;
  // Which tab opens first. The landing "Get started" CTAs deep-link with
  // ?tab=register so a new visitor lands on the sign-up form, not login.
  defaultTab?: "login" | "register";
  // better-auth error code from ?error=<code>, set when errorCallbackURL
  // bounces a refused OAuth sign-in back to /login.
  errorCode?: string;
}

function authErrorMessage(code: string): string {
  const normalized = code.trim().toLowerCase();
  // "unable_to_create_user" is what better-auth emits when the signup gate
  // (user.create.before hook) rejects an OAuth sign-up.
  if (
    normalized.includes("signup") ||
    normalized === "unable_to_create_user"
  ) {
    return "Sign-in was refused: sign-up is restricted to @composio.dev emails.";
  }
  return `Sign-in was refused: ${normalized.replace(/_/g, " ")}.`;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 4.75 12 4.75z" />
    </svg>
  );
}

export function LoginPage({
  firstTime = false,
  googleEnabled = false,
  signupOpen = true,
  defaultTab,
  errorCode,
}: LoginPageProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleGoogle = async () => {
    setPending(true);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/dashboard",
        // Gate-rejected OAuth users land back here (with ?error=<code>)
        // instead of better-auth's bare error page.
        errorCallbackURL: "/login",
      });
      if (result.error) {
        showErrorToast(result.error.message ?? "Google sign-in failed - try again");
        setPending(false);
        return;
      }
      // Success resolves with the Google redirect URL and the browser is about
      // to navigate away - stay pending (see handleLogin).
    } catch {
      showErrorToast("Google sign-in failed - try again");
      setPending(false);
    }
  };

  // Login form state
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form state
  const [regEmail, setRegEmail] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regInviteCode, setRegInviteCode] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      const result = await authClient.signIn.username({
        username: loginUsername,
        password: loginPassword,
      });
      if (result.error) {
        showErrorToast(result.error.message ?? "Failed to sign in");
        setPending(false);
        return;
      }
      // Keep the button in its pending state through the redirect - resetting
      // it here flips it back to "Sign in" while the dashboard is still
      // loading, which reads as a failed submit and invites a double-click.
      router.push("/dashboard");
    } catch {
      showErrorToast("Couldn't reach the server - check your connection and try again.");
      setPending(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate the username up front so the user gets a specific message
    // instead of a round-trip "Username is invalid" from the server.
    const usernameError = validateUsername(regUsername);
    if (usernameError) {
      showErrorToast(usernameError);
      return;
    }

    setPending(true);
    try {
      const result = await authClient.signUp.email(
        {
          email: regEmail,
          password: regPassword,
          username: regUsername,
          name: regName,
        },
        {
          // Sent as x-invite-code; the server's sign-up gate accepts a valid
          // code in place of an allowed email.
          headers: regInviteCode.trim()
            ? { "x-invite-code": regInviteCode.trim() }
            : undefined,
        },
      );
      if (result.error) {
        showErrorToast(result.error.message ?? "Failed to create account");
        setPending(false);
        return;
      }
      // Stay pending through the redirect (see handleLogin).
      router.push("/dashboard");
    } catch {
      showErrorToast("Couldn't reach the server - check your connection and try again.");
      setPending(false);
    }
  };

  return (
    <div className="bg-background relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      <div
        className="ambient-glow pointer-events-none absolute inset-0"
        aria-hidden
      />
      <div className="relative mx-auto w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <TrustClawBrand size="lg" logoLink="/" />
        </div>

        {errorCode && (
          <div className="bg-destructive/10 text-destructive mb-4 rounded-xl px-4 py-3 text-sm">
            {authErrorMessage(errorCode)}
          </div>
        )}

        <div className="glass elevated rounded-2xl p-6 sm:p-7">
          {googleEnabled && (
            <>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full gap-2 rounded-xl"
                onClick={() => void handleGoogle()}
                disabled={pending}
              >
                <GoogleIcon />
                Continue with Google
              </Button>
              <div className="text-muted-foreground my-4 flex items-center gap-3 text-xs">
                <span className="bg-border h-px flex-1" />
                or
                <span className="bg-border h-px flex-1" />
              </div>
            </>
          )}
          <Tabs defaultValue={defaultTab ?? (firstTime ? "register" : "login")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-4">
              <form className="space-y-4" onSubmit={handleLogin}>
                <div className="space-y-2">
                  <Label htmlFor="login-username">Username</Label>
                  <Input
                    id="login-username"
                    type="text"
                    autoComplete="username"
                    required
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? "Signing in..." : "Sign in"}
                </Button>
                <Link
                  href="/forgot-password"
                  className="text-muted-foreground hover:text-foreground block text-center text-sm"
                >
                  Forgot password?
                </Link>
              </form>
            </TabsContent>

            <TabsContent value="register" className="mt-4">
              <form className="space-y-4" onSubmit={handleRegister}>
                <div className="space-y-2">
                  <Label htmlFor="reg-name">Name</Label>
                  <Input
                    id="reg-name"
                    type="text"
                    autoComplete="name"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input
                    id="reg-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-username">Username</Label>
                  <Input
                    id="reg-username"
                    type="text"
                    autoComplete="username"
                    required
                    minLength={USERNAME_MIN_LENGTH}
                    maxLength={USERNAME_MAX_LENGTH}
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">
                    {USERNAME_HINT}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password">Password</Label>
                  <Input
                    id="reg-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                  />
                </div>
                {!signupOpen && (
                  <div className="space-y-2">
                    <Label htmlFor="reg-invite">
                      Invite code{" "}
                      <span className="text-muted-foreground font-normal">
                        (if you have one)
                      </span>
                    </Label>
                    <Input
                      id="reg-invite"
                      type="text"
                      autoComplete="off"
                      value={regInviteCode}
                      onChange={(e) => setRegInviteCode(e.target.value)}
                    />
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? "Creating account..." : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
