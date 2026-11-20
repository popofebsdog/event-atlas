import { defineConfig } from "@playwright/test";
const node = process.env.ATLAS_API_RUNTIME === "node";
const api = `http://localhost:${node ? 8788 : 8787}`,
  origin = `http://localhost:${node ? 5175 : 5174}`;
process.env.ATLAS_TEST_API_URL = api;
process.env.ATLAS_TEST_ORIGIN = origin;
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  use: { baseURL: origin, viewport: { width: 1280, height: 900 } },
  webServer: [
    node
      ? {
          command: "npm run api:node",
          url: api + "/api/health",
          reuseExistingServer: !process.env.CI,
          env: {
            ...process.env,
            PORT: "8788",
            PUBLIC_URL: api,
            ALLOWED_ORIGINS: origin,
            LOCAL_DEV: "true",
            ADMIN_TOKEN: "local-development-only-not-for-production",
            DB_PATH: ".local/node-e2e.sqlite",
          },
        }
      : {
          command: "npm run db:local && npm run api:dev",
          url: api + "/api/health",
          reuseExistingServer: !process.env.CI,
        },
    {
      command: `npm run dev:frontend -- --port ${node ? 5175 : 5174} --strictPort`,
      url: origin,
      reuseExistingServer: !process.env.CI,
      env: { ...process.env, VITE_API_URL: api },
    },
  ],
});
