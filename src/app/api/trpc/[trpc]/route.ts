import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";

import { env } from "~/env";
import { appRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a HTTP request (e.g. when you make requests from Client Components).
 */
const createContext = async (req: NextRequest) => {
  return createTRPCContext({
    headers: req.headers,
  });
};

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
    // Authenticated, per-user API responses must never be cached. Without
    // this, GET query responses carry no Cache-Control at all, so browsers
    // may heuristically disk-cache them - including ERROR responses, which
    // then replay from cache on every page load (frozen-app class of bugs),
    // and user data lingers in the browser cache.
    responseMeta: () => ({
      headers: { "cache-control": "no-store, max-age=0" },
    }),
    onError:
      env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(
              `tRPC failed on ${path ?? "<no-path>"}: ${error.message}`,
            );
          }
        : undefined,
  });

export const maxDuration = 60;
export { handler as GET, handler as POST };
