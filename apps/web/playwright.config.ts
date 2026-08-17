import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';

const appRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:3000' },
  webServer: {
    command: 'corepack pnpm exec next dev --hostname 127.0.0.1 --port 3000',
    cwd: appRoot,
    url: 'http://127.0.0.1:3000/logowanie',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000',
      NEXT_PUBLIC_IDENTITY_URL: 'http://127.0.0.1:4200',
      NEXT_PUBLIC_WEB_ORIGIN: 'http://127.0.0.1:3000',
      NEXT_PUBLIC_WEB_GUILDS: JSON.stringify([
        { id: '1534228693017432124', name: 'Serwer A' },
        { id: '999000999000999000', name: 'Serwer B' },
      ]),
    },
  },
});
