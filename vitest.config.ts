import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Mirror the "~/*" -> "./src/*" alias from tsconfig.json.
      "~": fileURLToPath(new URL("./src", import.meta.url)),
      // Next.js poison-pill package: importing it outside a Next server
      // component throws. Unit tests import server modules directly, so give
      // it an empty stub.
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  // tsconfig sets jsx: "preserve" (Next.js transforms it at build time); the
  // oxc transformer must be told to compile JSX for .tsx test files.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    // Server-module tests run in node; component tests opt into jsdom with a
    // per-file "// @vitest-environment jsdom" docblock.
    environment: "node",
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "e2e/**"],
    env: {
      // src/env.ts (t3-env) validates required server vars at import time.
      // Tests never talk to real services, so skip validation (honoured
      // because NODE_ENV !== "production" under vitest).
      SKIP_ENV_VALIDATION: "1",
    },
  },
});
