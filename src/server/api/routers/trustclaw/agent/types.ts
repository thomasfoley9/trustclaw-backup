import type { UserModelMessage } from "ai";

type ProviderOptions = UserModelMessage["providerOptions"];

export type JsonValue =
  | null
  | string
  | number
  | boolean
  | { [key: string]: JsonValue }
  | JsonValue[];

export type ToolResultOutput =
  | { type: "text"; value: string }
  | { type: "json"; value: JsonValue };

export type ReconstructedMessage =
  // Content is a string for normal/historical turns, or an array of parts
  // (text + image/file) for the current turn when files are attached.
  | {
      role: "user";
      content: UserModelMessage["content"];
      providerOptions?: ProviderOptions;
    }
  | {
      role: "assistant";
      content:
        | string
        | Array<
            | { type: "text"; text: string }
            | {
                type: "tool-call";
                toolCallId: string;
                toolName: string;
                input: Record<string, unknown>;
              }
          >;
      providerOptions?: ProviderOptions;
    }
  | {
      role: "tool";
      content: Array<{
        type: "tool-result";
        toolCallId: string;
        toolName: string;
        output: ToolResultOutput;
      }>;
      providerOptions?: ProviderOptions;
    };
