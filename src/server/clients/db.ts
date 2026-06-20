import { PrismaClient } from "~/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "~/env";

function ensureVerifyFullSsl(url: string): string {
  const parsed = new URL(url);
  // Local Postgres does not speak SSL — this covers loopback (host dev via
  // localhost:5433) AND single-label Docker-network service names like
  // "postgres" (the worker container reaching the compose DB). Remote managed
  // databases (Neon, RDS, …) are always reachable by FQDN, so they still get
  // verify-full enforced.
  const isLocal =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    !parsed.hostname.includes(".");
  if (isLocal) {
    return url;
  }
  if (parsed.searchParams.get("sslmode") !== "verify-full") {
    parsed.searchParams.set("sslmode", "verify-full");
  }
  return parsed.toString();
}

const createPrismaClient = () => {
  const adapter = new PrismaPg({
    connectionString: ensureVerifyFullSsl(env.DATABASE_URL),
  });

  return new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
};

const globalForPrisma = globalThis as typeof globalThis & {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
