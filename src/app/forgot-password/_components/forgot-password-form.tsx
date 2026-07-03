"use client";

import { useState } from "react";
import Link from "next/link";
import { TrustClawBrand } from "~/app/_components/trustclaw-brand";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { authClient } from "~/clients/auth/react";
import { showErrorToast } from "~/components/core/toast-notifications";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: "/reset-password",
      });
      if (result.error) {
        showErrorToast(result.error.message ?? "Failed to send reset link");
        return;
      }
      // Always show success regardless of whether the account exists, so we
      // don't leak which emails are registered.
      setSent(true);
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
          <h1 className="text-lg font-semibold">Reset your password</h1>

          {sent ? (
            <div className="mt-4 space-y-4">
              <p className="text-muted-foreground text-sm">
                If an account exists for <span className="font-medium">{email}</span>,
                a password reset link has been generated.
              </p>
              <p className="text-muted-foreground text-xs">
                This instance doesn&apos;t send email yet - the reset link is
                printed in the server logs. Open it to set a new password.
              </p>
              <Link href="/login" className="text-primary text-sm hover:underline">
                Back to login
              </Link>
            </div>
          ) : (
            <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
              <p className="text-muted-foreground text-sm">
                Enter your account email and we&apos;ll generate a reset link.
              </p>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Sending..." : "Send reset link"}
              </Button>
              <Link
                href="/login"
                className="text-muted-foreground hover:text-foreground block text-center text-sm"
              >
                Back to login
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
