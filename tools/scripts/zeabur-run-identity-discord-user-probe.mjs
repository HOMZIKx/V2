#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const identityServiceID = '6a8211cfbdeaa87e2c52df39';
const probePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'zeabur-probe-identity-discord-user.min.mjs',
);
const code = fs.readFileSync(probePath, 'utf8');

const result = spawnSync(
  'npx',
  [
    'zeabur@latest',
    '-i=false',
    'service',
    'exec',
    '--id',
    identityServiceID,
    '--env-id',
    environmentID,
    '--',
    'node',
    '--input-type=module',
    '-e',
    code,
  ],
  { encoding: 'utf8', shell: true, maxBuffer: 16 * 1024 * 1024 },
);
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
process.exit(result.status ?? 1);
