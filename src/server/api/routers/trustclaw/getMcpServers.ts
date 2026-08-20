import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { decryptSecret } from "~/server/clients/crypto";

// Show host + a hint of the path; the auth token lives further in the URL.
function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    const tail =
      u.pathname.length > 10 ? `${u.pathname.slice(0, 10)}…` : u.pathname;
    return `${u.host}${tail}`;
  } catch {
    return "…";
  }
}

export const getMcpServers = protectedProcedure.query(async ({ ctx }) => {
  const instance = await db.composioClawInstance.findUnique({
    where: { userId: ctx.session.user.id },
    select: { id: true },
  });
  if (!instance) return { servers: [] };

  const rows = await db.mcpServer.findMany({
    where: { instanceId: instance.id },
    select: { id: true, label: true, url: true },
    orderBy: { createdAt: "asc" },
  });

  return {
    servers: rows.map((r) => {
      let maskedUrl: string;
      try {
        maskedUrl = maskUrl(decryptSecret(r.url));
      } catch {
        maskedUrl = "…";
      }
      return { id: r.id, label: r.label, maskedUrl };
    }),
  };
});
