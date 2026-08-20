// Shared username rules - imported by both the Better Auth server config
// (src/server/auth.ts) and the register form (login-page.tsx) so client-side
// guidance can't drift from what the server actually enforces.

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

// Letters, digits, and . _ - - no spaces, @, or other symbols. Hyphens are
// allowed (common in handles, e.g. "casey-5672").
export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export const USERNAME_HINT = "Letters, numbers, and . _ - only";

// Pattern-only check (character set). Length is enforced separately by the
// Better Auth plugin's min/max options and the input's minLength/maxLength.
export function isValidUsernameChars(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

// Full check used client-side before submit, to surface a specific message
// instead of a round-trip "Username is invalid".
export function validateUsername(username: string): string | null {
  if (username.length < USERNAME_MIN_LENGTH) {
    return `Username must be at least ${USERNAME_MIN_LENGTH} characters.`;
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return `Username must be at most ${USERNAME_MAX_LENGTH} characters.`;
  }
  if (!USERNAME_PATTERN.test(username)) {
    return `Username can only contain ${USERNAME_HINT.toLowerCase()}.`;
  }
  return null;
}
