#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const serviceID = process.argv[3] ?? '6a8211c2a21454a2cf6ad77b';
const localFile = path.resolve(process.argv[2] ?? 'tools/scripts/zeabur-outbox-count.min.mjs');
const remote = '/tmp/remote-script.mjs';
const hex = Buffer.from(fs.readFileSync(localFile, 'utf8')).toString('hex');

function execNode(code) {
  return spawnSync(
    'npx',
    [
      'zeabur@latest',
      '-i=false',
      'service',
      'exec',
      '--id',
      serviceID,
      '--env-id',
      environmentID,
      '--',
      'node',
      '-e',
      code,
    ],
    { encoding: 'utf8', shell: true },
  );
}

const write = execNode(`require('fs').writeFileSync('${remote}.hex','${hex}')`);
process.stdout.write(write.stdout ?? '');
process.stderr.write(write.stderr ?? '');
if ((write.status ?? 1) !== 0) process.exit(write.status ?? 1);

const decode = execNode(
  `require('fs').writeFileSync('${remote}',Buffer.from(require('fs').readFileSync('${remote}.hex','utf8'),'hex'))`,
);
process.stdout.write(decode.stdout ?? '');
process.stderr.write(decode.stderr ?? '');
if ((decode.status ?? 1) !== 0) process.exit(decode.status ?? 1);

const run = spawnSync(
  'npx',
  [
    'zeabur@latest',
    '-i=false',
    'service',
    'exec',
    '--id',
    serviceID,
    '--env-id',
    environmentID,
    '--',
    'node',
    remote,
  ],
  { encoding: 'utf8', shell: true },
);
process.stdout.write(run.stdout ?? '');
process.stderr.write(run.stderr ?? '');
process.exit(run.status ?? 1);
