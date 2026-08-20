# PR 03: Activation path

Branch: `fable/03-activation-path`
Base: `fable/02-chat-correctness`

## What changed

- **The wall is gone.** `ComposioActivationGate` deleted; the dashboard renders chat immediately after onboarding. The existing dismissible `ComposioKeyBanner` carries the Composio ask (its `/dashboard` suppression removed since the gate no longer owns that route). The React #418 no-prefetch rationale in `dashboard/page.tsx` is untouched.
- **Password reset dead end removed.** No email provider exists, so the "Forgot password?" link and the `/forgot-password` route are deleted rather than shipped as a dead end. `/reset-password` stays (it's the target of operator-minted links from server logs); its dead link now goes back to login. The server's log-based `sendResetPassword` handler is unchanged and still documents the one-line provider swap.
- **Deep links survive login.** `(authenticated)/layout.tsx` redirects to `/login?next=<path+query>` via a client guard (no middleware exists to read the path server-side); password, register, and Google flows all land on the sanitized `next` (must start with `/`, not `//`).
- **Session expiry redirects.** UNAUTHORIZED tRPC errors toast, then navigate to `/login?next=<current>` after 1.5s (once, never on /login). Uses `window.location` because the error module has no hook context; commented as such.
- **Onboarding saves get `onError: trpcToastOnError`.** Progress dots take a real `total` (7 or 8 depending on Telegram).
- **Encryption reassurance standardized** across all six credential surfaces: "Stored encrypted (AES-256-GCM); only this instance can read it."
- **OAuth refusal message** now comes from the server's real allowlist (`signupRestrictionMessage()` exported from auth.ts) instead of hardcoded `@composio.dev`.
- **Brand demo CTAs** point at `/login?tab=register`; the header "Sign in" link intentionally stays `/login`.
- **Re-run setup (non-destructive).** New `redoRequested` flag on `OnboardingState` (with migration `20260713090000_onboarding_redo_flag`), `restartOnboarding` / `completeOnboarding` procedures, and a Settings card with an AlertDialog stating nothing is deleted. Prior answers are preserved; completing the wizard clears the flag.

## Acceptance

- [x] Fresh account: onboarding with free model + zero integrations lands in a working chat, no wall
- [x] pnpm typecheck + lint clean

## Notes

- Migration SQL is hand-written (matches the `onboarding_state` mapped table); run `prisma migrate deploy` on environments as usual. No database was touched from this machine.
- `hasOnboardingState` in getStatus simplified to "row exists"; verified its only consumer is the onboarding client.
- Dependencies added: none.
