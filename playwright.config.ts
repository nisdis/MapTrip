import { defineConfig } from "@playwright/test";

const API_PORT = 3999;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // tests share one database
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
    permissions: ["geolocation", "clipboard-read", "clipboard-write"],
    trace: "off",
  },
  webServer: [
    {
      // Real /api functions against the test database
      command: "npx tsx tests/e2e/api-server.ts",
      port: API_PORT,
      reuseExistingServer: !process.env.CI,
      env: {
        API_PORT: String(API_PORT),
        BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-1234",
        BETTER_AUTH_URL: "http://127.0.0.1:4173",
      },
    },
    {
      // The built app; /api is proxied to the server above (vite.config proxy)
      command: "npx vite preview --host 127.0.0.1 --port 4173 --strictPort",
      port: 4173,
      reuseExistingServer: !process.env.CI,
      env: { API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
