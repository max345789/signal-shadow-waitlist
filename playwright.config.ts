import { defineConfig } from "@playwright/test";
import fs from "node:fs";

function resolveLocalBrowserExecutable(): string | undefined {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

const executablePath = resolveLocalBrowserExecutable();

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  webServer: {
    command: "npx next start -p 3100 -H 127.0.0.1",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: "",
      AUTH_SECRET: "playwright-e2e-secret-key-minimum-32-characters",
      AUTH_PROVIDER: "local-dev",
      NEXT_PUBLIC_DEFAULT_CURRENCY: "INR",
    },
  },
});
