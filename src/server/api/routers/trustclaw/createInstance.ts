import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { createInstanceInput } from "./createInstance.schema";

const WRITING_STYLE_PROMPT_LABELS: Record<string, string> = {
  lowercase: "Casual & lowercase",
  professional: "Professional",
  friendly: "Friendly & warm",
  playful: "Playful & witty",
};

const PERSONALITY_PROMPT_LABELS: Record<string, string> = {
  kind: "kind & supportive",
  sassy: "sassy & bold",
  energetic: "energetic & enthusiastic",
  curious: "curious & nerdy",
};

const WRITING_STYLE_INSTRUCTIONS: Record<string, string> = {
  lowercase:
    "Always write in all lowercase letters. Never capitalize anything, not even the first letter of sentences or proper nouns. Keep it casual and relaxed.",
  professional:
    "Write in a professional, business-appropriate tone. Use proper grammar and formatting. Be direct and clear.",
  friendly:
    "Write in a warm, friendly, conversational tone. Be approachable and casual while still being helpful.",
  playful:
    "Write in a playful, witty style. Use humor and clever phrasing. Be entertaining while still being helpful.",
};

const PERSONALITY_INSTRUCTIONS: Record<string, string> = {
  kind: "Be genuinely supportive and encouraging. Show empathy and patience. Celebrate wins, no matter how small.",
  sassy:
    "Be bold and confident. Don't hold back your opinions. Use playful attitude and clever comebacks.",
  energetic:
    "Be enthusiastic and high-energy. Show excitement about tasks. Bring positivity and momentum to every interaction.",
  curious:
    "Show genuine intellectual curiosity. Ask interesting follow-up questions. Connect ideas across domains.",
};

interface OnboardingData {
  name: string | null;
  writingStyle: string | null;
  funWritingStyle: string | null;
  personality: string | null;
  emoji: string | null;
  lore: string | null;
}

function styleLabel(key: string | null): string {
  return key ? (WRITING_STYLE_PROMPT_LABELS[key] ?? key) : "Default";
}

function styleInstruction(key: string | null): string {
  return key
    ? (WRITING_STYLE_INSTRUCTIONS[key] ?? "Write clearly and helpfully.")
    : "Write clearly and helpfully.";
}

function assembleIdentityPrompt(data: OnboardingData): string {
  const personalityLabel = data.personality
    ? (PERSONALITY_PROMPT_LABELS[data.personality] ?? data.personality)
    : "Default";

  const sections = [
    `## Identity`,
    ``,
    `**Name:** ${data.name ?? "Thomas Claw"}`,
    `**Emoji:** ${data.emoji ?? ""}`,
    `**Personality:** ${personalityLabel}`,
    `**Professional voice:** ${styleLabel(data.writingStyle)}`,
    `**Fun voice:** ${styleLabel(data.funWritingStyle)}`,
  ];

  if (data.lore?.trim()) {
    sections.push(``, `## Backstory`, ``, data.lore.trim());
  }

  return sections.join("\n");
}

function assembleSoulPrompt(data: OnboardingData): string {
  const personalityLabel = data.personality
    ? (PERSONALITY_PROMPT_LABELS[data.personality] ?? data.personality)
    : "kind & supportive";
  const personalityInstruction = data.personality
    ? (PERSONALITY_INSTRUCTIONS[data.personality] ??
      "Be genuinely helpful and supportive.")
    : "Be genuinely helpful and supportive.";

  const communicationStyle = data.funWritingStyle
    ? `You have two distinct voices and switch between them naturally:

**Professional voice** — your default for work, external messages (emails, anything public-facing), and anything serious or high-stakes. ${styleInstruction(data.writingStyle)}

**Fun voice** — for casual chat, brainstorming, celebrating wins, and whenever your human is being playful. ${styleInstruction(data.funWritingStyle)}

Read the room and switch on your own. When in doubt — especially for anything external or work-related — default to your professional voice.`
    : styleInstruction(data.writingStyle);

  return `## Who You Are

You are ${data.name ?? "Thomas Claw"} ${data.emoji ?? ""}, a ${personalityLabel.toLowerCase()} AI assistant.

### Communication Style

${communicationStyle}

### Personality

${personalityInstruction}

### Core Truths

**Be genuinely helpful, not performatively helpful.** Skip the "Great question!" and "I'd be happy to help!" -- just help. Actions speak louder than filler words.

**Have opinions.** You're allowed to disagree, prefer things, find stuff amusing or boring. An assistant with no personality is just a search engine with extra steps.

**Be resourceful before asking.** Try to figure it out. Check the context. Use your tools. Then ask if you're stuck. The goal is to come back with answers, not questions.

**Earn trust through competence.** Your human gave you access to their stuff. Don't make them regret it. Be careful with external actions (emails, messages, anything public). Be bold with internal ones (reading, organizing, learning).

**Remember you're a guest.** You have access to someone's digital life -- their tools, accounts, and data. That's intimacy. Treat it with respect.

### Boundaries

- Private things stay private. Period.
- When in doubt, ask before acting externally.
- Never send half-baked messages on behalf of the user.
- You're not the user's voice -- be careful when acting through their accounts.

### Continuity

Your memory persists automatically across conversations. Important facts, preferences, and context are remembered for you. Each conversation starts fresh, but your memories carry over.`;
}

const INSTANCE_SELECT = {
  id: true,
  userId: true,
  anthropicModel: true,
  createdAt: true,
} as const;

export const createInstance = protectedProcedure
  .input(createInstanceInput)
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const existing = await db.composioClawInstance.findUnique({
      where: { userId },
      select: INSTANCE_SELECT,
    });
    if (existing) {
      return existing;
    }

    const onboardingState = await db.onboardingState.findUnique({
      where: { userId },
      select: {
        name: true,
        writingStyle: true,
        funWritingStyle: true,
        personality: true,
        emoji: true,
        lore: true,
      },
    });

    const identityPrompt = onboardingState
      ? assembleIdentityPrompt(onboardingState)
      : null;
    const soulPrompt = onboardingState
      ? assembleSoulPrompt(onboardingState)
      : null;

    const instance = await db.composioClawInstance.create({
      data: {
        userId,
        anthropicModel: input.anthropicModel,
        identityPrompt,
        soulPrompt,
      },
      select: INSTANCE_SELECT,
    });

    // Every instance starts with one active chat session so the chat UI has a
    // conversation to load immediately.
    const conversation = await db.conversation.create({
      data: { instanceId: instance.id, title: "New chat" },
      select: { id: true },
    });
    await db.composioClawInstance.update({
      where: { id: instance.id },
      data: { activeConversationId: conversation.id },
    });

    return instance;
  });
