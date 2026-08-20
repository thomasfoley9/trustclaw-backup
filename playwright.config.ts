import { defineConfig, devices } from "@playwright/test";

// E2E config. Kept OUT of `pnpm test` (vitest) on purpose - these specs need a
// running database (docker-compose.yml provides pgvector on :5433) plus the
// usual .env, and boot the real Next dev server. Run with: pnpm test:e2e
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
