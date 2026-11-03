import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  use: {
    baseURL: process.env.AJORA_TEST_BASE_URL ?? "http://127.0.0.1:3100",
    reducedMotion: "reduce",
    launchOptions: { executablePath: process.env.AJORA_CHROME_PATH },
  },
});
