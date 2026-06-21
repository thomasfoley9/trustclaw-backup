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
// replies) — a send failure must NEVER throw: throwing here cuts the agent loop
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

    // Markdown parsing failed (e.g. underscores in URLs) — retry as plain text.
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
