import { tool, jsonSchema, type ToolSet } from "ai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { db } from "./db";
import { decryptSecret } from "./crypto";

const CLIENT_INFO = { name: "thomas-claw", version: "1.0.0" } as const;
const CONNECT_TIMEOUT_MS = 10_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms,
      ),
    ),
  ]);
}

// Connect to an MCP server over Streamable HTTP. Caller must close().
async function connect(url: string): Promise<Client> {
  const client = new Client(CLIENT_INFO);
  const transport = new StreamableHTTPClientTransport(new URL(url));
  await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, "MCP connect");
  return client;
}

// Namespace a tool name with its server label so different MCP servers can't
// collide, and keep it within the [a-z0-9_] tool-name charset.
function sanitizeToolName(label: string, name: string): string {
  const base = `${label}_${name}`
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return base.slice(0, 60) || "mcp_tool";
}

// Validate a URL by connecting + listing its tools. Returns the tool count;
// throws on failure. Used by the add-server procedure for early feedback.
export async function validateMcpServer(url: string): Promise<number> {
  let client: Client | null = null;
  try {
    client = await connect(url);
    const { tools } = await withTimeout(
      client.listTools(),
      CONNECT_TIMEOUT_MS,
      "MCP listTools",
    );
    return tools.length;
  } finally {
    if (client) await client.close().catch(() => undefined);
  }
}

// Load all of an instance's MCP servers' tools for one agent run. Clients stay
// open for the run; the returned close() tears them down (call it in onFinish).
// A failing/unreachable server is logged and skipped - never kills the run.
export async function loadMcpTools(
  instanceId: string,
): Promise<{ tools: ToolSet; close: () => Promise<void> }> {
  const servers = await db.mcpServer.findMany({
    where: { instanceId },
    select: { id: true, label: true, url: true },
  });

  const tools: ToolSet = {};
  const clients: Client[] = [];

  await Promise.all(
    servers.map(async (server) => {
      let url: string;
      try {
        url = decryptSecret(server.url);
      } catch {
        return;
      }

      let client: Client;
      try {
        client = await connect(url);
      } catch (error) {
        console.error(
          `[mcp] connect failed for "${server.label}":`,
          error instanceof Error ? error.message : error,
        );
        return;
      }

      try {
        const { tools: mcpTools } = await withTimeout(
          client.listTools(),
          CONNECT_TIMEOUT_MS,
          "MCP listTools",
        );
        clients.push(client);
        for (const t of mcpTools) {
          const name = sanitizeToolName(server.label, t.name);
          tools[name] = tool({
            description: t.description ?? `${server.label}: ${t.name}`,
            inputSchema: jsonSchema(
              (t.inputSchema as Parameters<typeof jsonSchema>[0]) ?? {
                type: "object",
                properties: {},
              },
            ),
            execute: async (args) => {
              const result = await client.callTool({
                name: t.name,
                arguments: (args ?? {}) as Record<string, unknown>,
              });
              return result.content;
            },
          });
        }
      } catch (error) {
        console.error(
          `[mcp] listTools failed for "${server.label}":`,
          error instanceof Error ? error.message : error,
        );
        await client.close().catch(() => undefined);
      }
    }),
  );

  return {
    tools,
    close: async () => {
      await Promise.allSettled(clients.map((c) => c.close()));
    },
  };
}
