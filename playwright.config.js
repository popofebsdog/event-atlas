import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: {baseURL:'http://localhost:5174', viewport:{width:1280,height:900}},
  webServer: [
    {command:'npm run db:local && npm run api:dev',url:'http://localhost:8787/api/health',reuseExistingServer:!process.env.CI},
    {command:'npm run dev -- --port 5174 --strictPort',url:'http://localhost:5174',reuseExistingServer:!process.env.CI},
  ],
});
