import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';

import { E2E_API_BASE_URL } from './e2e/constants.js';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const e2ePort = process.env.WEB_E2E_PORT?.trim() || '3000';
const e2eOrigin = `http://127.0.0.1:${e2ePort}`;

const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === 'string' &&
      !entry[0].startsWith('NEXT_PUBLIC_') &&
      !entry[0].startsWith('V2_SMOKE_') &&
      entry[0] !== 'V2_EXPECTED_SHA',
  ),
);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: e2eOrigin },
  webServer: {
    command: `corepack pnpm exec next dev --hostname 127.0.0.1 --port ${e2ePort}`,
    cwd: appRoot,
    url: `${e2eOrigin}/logowanie`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...inheritedEnv,
      NODE_ENV: 'development',
      NEXT_PUBLIC_API_BASE_URL: E2E_API_BASE_URL,
      NEXT_PUBLIC_IDENTITY_URL: 'http://127.0.0.1:4200',
      NEXT_PUBLIC_WEB_ORIGIN: e2eOrigin,
      NEXT_PUBLIC_WEB_GUILDS: JSON.stringify([
        { id: '1534228693017432124', name: 'Serwer A' },
        { id: '999000999000999000', name: 'Serwer B' },
      ]),
    },
  },
});
