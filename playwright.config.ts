import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3001",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 3001",
    url: "http://127.0.0.1:3001/pipelines",
    env: {
      PORCELAIN_RPK_PATH: process.env.PORCELAIN_RPK_PATH ?? "/home/sachin/.local/bin/rpk",
      PORCELAIN_CONNECT_EXECUTABLE: process.env.PORCELAIN_CONNECT_EXECUTABLE ?? "/home/sachin/.local/bin/.rpk.managed-connect",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
