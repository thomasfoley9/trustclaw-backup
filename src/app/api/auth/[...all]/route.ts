import { auth } from "~/server/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Account creation is gated by the email allowlist (domain + explicit address)
// in src/server/auth.ts's user.create.before hook, which covers both password
// and Google sign-up. There is no invite code.
const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;
export const POST = handlers.POST;
