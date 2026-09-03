#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const activityServiceID = '6a8211c2a21454a2cf6ad77b';
const probePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'zeabur-container-authz-probe.min.mjs',
);
const code = fs.readFileSync(probePath, 'utf8');
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

execFileSync(
  npxCmd,
  [
    'zeabur@latest',
    '-i=false',
    'service',
    'exec',
    '--id',
    activityServiceID,
    '--env-id',
    environmentID,
    '--',
    'node',
    '--input-type=module',
    '-e',
    code,
  ],
  { stdio: 'inherit', maxBuffer: 16 * 1024 * 1024 },
);
