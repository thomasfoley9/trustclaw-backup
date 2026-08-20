import type { ToolSet } from "ai";
import { createMemorySaveTool } from "./memory-save";
import { createMemorySearchTool } from "./memory-search";
import { createScheduleTool } from "./schedule";
import { createGenerateImageTool } from "./generate-image";
import { createEaTaskTool } from "./ea-task";
export { searchMemoriesForContext, getBucketMemories } from "./memory-search";

interface CustomToolOptions {
  activeBucket?: string;
  // When true, memory tools are omitted entirely (incognito chats neither
  // recall nor write to the long-term memory store).
  incognito?: boolean;
}

export function createCustomTools(
  instanceId: string,
  userTimezone = "UTC",
  options: CustomToolOptions = {},
): ToolSet {
  const { activeBucket, incognito = false } = options;

  const tools: ToolSet = {
    schedule: createScheduleTool(instanceId, userTimezone),
    generate_image: createGenerateImageTool(instanceId),
    ea_task: createEaTaskTool(instanceId),
  };

  if (!incognito) {
    tools.memory_save = createMemorySaveTool(instanceId, activeBucket);
    tools.memory_search = createMemorySearchTool(instanceId, activeBucket);
  }

  return tools;
}
