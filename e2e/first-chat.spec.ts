/*
 * First-run happy path: register -> onboarding (free house model, zero
 * integrations) -> first chat message with the model MOCKED at the network
 * layer.
 *
 * REQUIREMENTS (this spec is skipped-by-hand tonight; it has NOT been run):
 *   - A reachable Postgres with migrations applied (docker-compose.yml ships
 *     pgvector/pgvector:pg16 on port 5433) and a valid .env
 *     (DATABASE_URL, BETTER_AUTH_SECRET, CRON_SECRET).
 *   - Registration open (SIGNUP_RESTRICTED unset) or a valid invite code.
 *   - `pnpm dev` reachable on :3000 (the webServer block starts it if not).
 *
 * The LLM is never called: POST /api/chat is intercepted with page.route()
 * and answered with a canned AI SDK UI-message-stream (SSE) response, so the
 * flow is deterministic and free.
 */
import { expect, test, type Page } from "@playwright/test";

const MOCK_REPLY = "Hello from the mock model.";

// Wire format of the AI SDK v6 UI message stream (createUIMessageStreamResponse):
// each chunk is `data: <json>\n\n`, terminated by `data: [DONE]\n\n`, with the
// x-vercel-ai-ui-message-stream: v1 marker header.
function cannedUiMessageStream(text: string): string {
  const chunks: Array<Record<string, unknown>> = [
    { type: "start" },
    { type: "start-step" },
    { type: "text-start", id: "txt-1" },
    ...text
      .split(" ")
      .map((word, i, words) => ({
        type: "text-delta",
        id: "txt-1",
        delta: i < words.length - 1 ? `${word} ` : word,
      })),
    { type: "text-end", id: "txt-1" },
    { type: "finish-step" },
    { type: "finish" },
  ];
  return (
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
    "data: [DONE]\n\n"
  );
}

async function mockChatEndpoint(page: Page): Promise<void> {
  await page.route("**/api/chat", async (route) => {
    if (route.request().method() !== "POST") {
      // GET /api/chat?streamId=... is the resumable-stream reattach path -
      // let it through untouched.
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "x-vercel-ai-ui-message-stream": "v1",
      },
      body: cannedUiMessageStream(MOCK_REPLY),
    });
  });
}

test("register, onboard with the free house model, and get a first reply", async ({
  page,
}) => {
  const unique = Date.now().toString(36);
  const username = `e2e-${unique}`;

  // ---- Sign up via the Register tab ----
  await page.goto("/login");
  await page.getByRole("tab", { name: "Register" }).click();
  await page.locator("#reg-name").fill("E2E Tester");
  await page.locator("#reg-email").fill(`e2e-${unique}@example.com`);
  await page.locator("#reg-username").fill(username);
  await page.locator("#reg-password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();

  // ---- Onboarding ----
  // 1. Name
  await page.getByPlaceholder("Luna, Jarvis, Buddy...").fill("Mocha");
  await page.getByRole("button", { name: "Continue" }).click();

  // 2. Writing style: one pick per grid (both grids share the same labels,
  //    so disambiguate by position).
  await page.getByRole("button", { name: "crisp & polished" }).first().click();
  await page
    .getByRole("button", { name: "like texting a friend" })
    .nth(1)
    .click();
  await page.getByRole("button", { name: "Continue" }).click();

  // 3. Personality
  await page
    .getByRole("button", { name: "your personal cheerleader" })
    .click();
  await page.getByRole("button", { name: "Continue" }).click();

  // 4. Emoji
  await page.getByRole("button", { name: "\u{1F319}" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // 5. Lore is optional
  await page.getByRole("button", { name: "Skip" }).click();

  // 6. Model: pick the free house model explicitly, then continue.
  await page.getByRole("button", { name: /Kimi K3/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // 7. Integrations: zero integrations - skip. When TELEGRAM_BOT_TOKEN is set
  //    a Telegram step follows; skip that too. Completion runs a mutation +
  //    router.refresh() (a server roundtrip), so wait between clicks instead
  //    of hammering Skip while the step is still transitioning.
  for (let i = 0; i < 3; i++) {
    const composer = page.getByPlaceholder("Ask me anything...");
    const appeared = await composer
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (appeared) break;
    await page
      .getByRole("button", { name: /^Skip/ })
      .first()
      .click();
  }

  // ---- First chat message against the mocked model ----
  await mockChatEndpoint(page);

  const composer = page.getByPlaceholder("Ask me anything...");
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await composer.fill("Hello, are you alive?");
  await composer.press("Enter");

  // The user's message renders...
  await expect(page.getByText("Hello, are you alive?")).toBeVisible();
  // ...and the canned assistant reply streams in.
  await expect(page.getByText(MOCK_REPLY)).toBeVisible({ timeout: 15_000 });
});
