import { describe, expect, it, vi } from "vitest";

// The tool factories import the Prisma singleton (and, via the schedule tool,
// the QStash client) at module load. Tests only inspect the returned ToolSet
// shape, so the db never needs to exist.
vi.mock("~/server/clients/db", () => ({ db: {} }));

import { createCustomTools } from "./index";

describe("createCustomTools", () => {
  it("includes memory, schedule, task, and image tools by default", () => {
    const tools = createCustomTools("instance-1");
    expect(Object.keys(tools).sort()).toEqual([
      "ea_task",
      "generate_image",
      "memory_save",
      "memory_search",
      "schedule",
    ]);
  });

  it("drops BOTH memory tools in incognito mode", () => {
    // Advertising absent tools makes the model call undeclared names and
    // hallucinate saves - incognito must remove them entirely, not stub them.
    const tools = createCustomTools("instance-1", "UTC", { incognito: true });
    expect(Object.keys(tools).sort()).toEqual([
      "ea_task",
      "generate_image",
      "schedule",
    ]);
    expect(tools).not.toHaveProperty("memory_save");
    expect(tools).not.toHaveProperty("memory_search");
  });

  it("keeps memory tools when incognito is explicitly false", () => {
    const tools = createCustomTools("instance-1", "UTC", { incognito: false });
    expect(tools).toHaveProperty("memory_save");
    expect(tools).toHaveProperty("memory_search");
  });

  it("always exposes the schedule tool", () => {
    for (const options of [{}, { incognito: true }, { incognito: false }]) {
      const tools = createCustomTools("instance-1", "UTC", options);
      expect(tools).toHaveProperty("schedule");
    }
  });

  it("returns real tool definitions with descriptions and input schemas", () => {
    const tools = createCustomTools("instance-1", "America/New_York", {
      activeBucket: "work",
    });
    for (const [name, tool] of Object.entries(tools)) {
      expect(tool?.description, `${name} description`).toBeTruthy();
      expect(tool?.inputSchema, `${name} inputSchema`).toBeDefined();
      expect(tool?.execute, `${name} execute`).toBeTypeOf("function");
    }
  });
});
