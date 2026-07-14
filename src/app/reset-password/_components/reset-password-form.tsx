"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TrustClawBrand } from "~/app/_components/trustclaw-brand";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { authClient } from "~/clients/auth/react";
import {
  showErrorToast,
  showSuccessToast,
} from "~/components/core/toast-notifications";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const linkError = searchParams.get("error");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);

  const invalidLink = !token || !!linkError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (password !== confirm) {
      showErrorToast("Passwords don't match");
      return;
    }
    setPending(true);
    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (result.error) {
        showErrorToast(result.error.message ?? "Failed to reset password");
        return;
      }
      showSuccessToast("Password updated - please log in");
      // Stay pending through the redirect so the button doesn't flip back.
      router.push("/login");
    } catch {
      showErrorToast(
        "Couldn't reach the server - check your connection and try again.",
      );
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

        <div className="glass elevated rounded-2xl p-6 sm:p-7">
          <h1 className="text-lg font-semibold">Set a new password</h1>

          {invalidLink ? (
            <div className="mt-4 space-y-4">
              <p className="text-muted-foreground text-sm">
                This reset link is invalid or has expired. Ask whoever runs
                this instance to generate a new one.
              </p>
              <Link
                href="/login"
                className="text-primary text-sm hover:underline"
              >
                Back to login
              </Link>
            </div>
          ) : (
            <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Updating..." : "Update password"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
