import { z } from "zod";
import { memoryBucketSchema } from "./memory-buckets";

export const saveConversationToBucketInput = z.object({
  conversationId: z.string(),
  bucketSlug: memoryBucketSchema,
});

export type SaveConversationToBucketInput = z.infer<
  typeof saveConversationToBucketInput
>;
