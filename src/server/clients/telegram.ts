import { env } from "~/env";

export function isTelegramConfigured(): boolean {
  return !!env.TELEGRAM_BOT_TOKEN && !!env.TELEGRAM_BOT_USERNAME;
}

function getTelegramApiBase(): string {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("Telegram not configured");
  }
  return `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
}

// Best-effort outbound. These are UI feedback (typing indicator, partial/final
// replies) - a send failure must NEVER throw: throwing here cuts the agent loop
// short (the user gets no final answer) and leaks as an unhandled rejection in
// the webhook's after() callback. Log and move on. The response body is not
// logged (it can carry upstream detail).
export async function sendTelegramMessage(
  chatId: string,
  text: string,
): Promise<void> {
  try {
    const TELEGRAM_API_BASE = getTelegramApiBase();
    // Try with Markdown formatting first.
    const markdownResponse = await fetch(`${TELEGRAM_API_BASE}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    if (markdownResponse.ok) return;

    // Markdown parsing failed (e.g. underscores in URLs) - retry as plain text.
    const plainResponse = await fetch(`${TELEGRAM_API_BASE}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!plainResponse.ok) {
      console.error(`[telegram] sendMessage failed: ${plainResponse.status}`, {
        chatId,
        textLength: text.length,
      });
    }
  } catch (err) {
    console.error(
      "[telegram] sendMessage error",
      err instanceof Error ? err.message : err,
    );
  }
}

// Telegram rejects sendMessage payloads over 4096 characters.
const TELEGRAM_MAX_MESSAGE_CHARS = 4096;

// Split text into <=4096-char pieces, preferring newline boundaries, then
// word boundaries, then a hard cut.
function chunkTelegramText(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > TELEGRAM_MAX_MESSAGE_CHARS) {
    const window = remaining.slice(0, TELEGRAM_MAX_MESSAGE_CHARS);
    let splitAt = window.lastIndexOf("\n");
    if (splitAt <= 0) splitAt = window.lastIndexOf(" ");
    if (splitAt <= 0) splitAt = TELEGRAM_MAX_MESSAGE_CHARS;
    chunks.push(remaining.slice(0, splitAt));
    // Drop the boundary character itself (not on hard cuts).
    const skip = splitAt < TELEGRAM_MAX_MESSAGE_CHARS ? 1 : 0;
    remaining = remaining.slice(splitAt + skip);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

// Long replies used to be truncated mid-content at 4096 chars. Send them as
// sequential chunks instead. Same best-effort posture as sendTelegramMessage:
// each chunk send swallows its own failure, so this never throws.
export async function sendTelegramMessageChunked(
  chatId: string,
  text: string,
): Promise<void> {
  for (const chunk of chunkTelegramText(text)) {
    await sendTelegramMessage(chatId, chunk);
  }
}

export async function sendChatAction(
  chatId: string,
  action: "typing",
): Promise<void> {
  try {
    const TELEGRAM_API_BASE = getTelegramApiBase();
    const response = await fetch(`${TELEGRAM_API_BASE}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
    if (!response.ok) {
      console.error(`[telegram] sendChatAction failed: ${response.status}`, {
        chatId,
        action,
      });
    }
  } catch (err) {
    console.error(
      "[telegram] sendChatAction error",
      err instanceof Error ? err.message : err,
    );
  }
}
