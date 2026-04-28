import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.pw.ts",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true
  },
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1 --directory public",
    port: 4173,
    reuseExistingServer: !process.env.CI
  }
});
