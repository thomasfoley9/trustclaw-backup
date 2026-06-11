import { auth } from "~/server/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { env } from "~/env";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

// Single-tenant cell gate: when SIGNUP_INVITE_CODE is configured, account
// registration requires the matching code (sent as the x-invite-code header).
// Sign-in and all other auth routes are unaffected, so existing members keep
// working and the cell stays closed to strangers.
export const POST = async (request: Request) => {
  if (env.SIGNUP_INVITE_CODE) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/sign-up/email")) {
      const supplied = request.headers.get("x-invite-code") ?? "";
      if (supplied !== env.SIGNUP_INVITE_CODE) {
        return Response.json(
          { message: "Invite code required. Ask your team admin for one." },
          { status: 403 },
        );
      }
    }
  }
  return handlers.POST(request);
};
