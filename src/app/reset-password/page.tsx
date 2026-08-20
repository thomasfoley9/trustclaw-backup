import { Suspense } from "react";
import { ResetPasswordForm } from "./_components/reset-password-form";

export default function Page() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
