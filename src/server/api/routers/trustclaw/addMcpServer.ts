import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { encryptSecret } from "~/server/clients/crypto";
import { validateMcpServer } from "~/server/clients/mcp";
import { addMcpServerInput } from "./addMcpServer.schema";

export const addMcpServer = protectedProcedure
  .input(addMcpServerInput)
  .mutation(async ({ ctx, input }) => {
    const instance = await db.composioClawInstance.findUnique({
      where: { userId: ctx.session.user.id },
      select: { id: true },
    });
    if (!instance) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Agent instance not found.",
      });
    }

    // Connect for real before saving so a bad URL fails fast with feedback.
    let toolCount: number;
    try {
      toolCount = await validateMcpServer(input.url);
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Couldn't connect to that MCP server (${
          error instanceof Error ? error.message : "unknown error"
        }). Double-check the URL.`,
      });
    }

    const server = await db.mcpServer.create({
      data: {
        instanceId: instance.id,
        label: input.label,
        url: encryptSecret(input.url),
      },
      select: { id: true, label: true },
    });

    return { ...server, toolCount };
  });
