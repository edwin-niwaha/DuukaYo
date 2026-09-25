import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 120000,
  expect: { timeout: 15000 },
  workers: 1,
  use: {
    baseURL: process.env.PW_BASE_URL || "http://localhost:3000",
    channel: "msedge",
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  reporter: "list",
});
