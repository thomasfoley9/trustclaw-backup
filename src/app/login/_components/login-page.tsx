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
}

export function LoginPage({ firstTime = false }: LoginPageProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

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
        return;
      }
      router.push("/dashboard");
    } finally {
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
          // Cell invite gate: checked server-side only when the deployment
          // has SIGNUP_INVITE_CODE configured; ignored otherwise.
          headers: regInviteCode
            ? { "x-invite-code": regInviteCode }
            : undefined,
        },
      );
      if (result.error) {
        showErrorToast(result.error.message ?? "Failed to create account");
        return;
      }
      router.push("/dashboard");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center">
      <div className="mx-auto w-full max-w-sm px-4">
        <div className="mb-8 flex justify-center">
          <TrustClawBrand size="lg" logoLink="/" />
        </div>

        <div className="bg-card rounded-lg border p-6 shadow-sm">
          <Tabs defaultValue={firstTime ? "register" : "login"}>
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
                <div className="space-y-2">
                  <Label htmlFor="reg-invite">
                    Invite code{" "}
                    <span className="text-muted-foreground font-normal">
                      (if your team requires one)
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
