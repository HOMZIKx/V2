import { defineConfig } from '@playwright/test';

const DEV_GUILDS = JSON.stringify([{ id: 'guild-e2e-1', name: 'E2E Guild Alpha' }]);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:3001' },
  webServer: {
    command: 'corepack pnpm exec vite --host 127.0.0.1 --port 3001',
    url: 'http://127.0.0.1:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_ADMIN_DEV_ACTOR_DISCORD_ID: '999888777666555444',
      VITE_ADMIN_DEV_GUILDS: DEV_GUILDS,
      VITE_ADMIN_DEV_ORG_ID: 'org-e2e',
      VITE_API_BASE_URL: 'http://127.0.0.1:4400',
    },
  },
});
