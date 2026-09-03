#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const activityServiceID = '6a8211c2a21454a2cf6ad77b';
const localFile = process.argv[2];
const remoteFile = process.argv[3] ?? '/tmp/uploaded-script.mjs';
if (localFile === undefined) {
  console.error('usage: zeabur-upload-and-run.mjs <local-file> [remote-file]');
  process.exit(1);
}

function execRemote(args) {
  const result = spawnSync(
    'npx',
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
      ...args,
    ],
    { encoding: 'utf8', shell: true },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status ?? 1;
}

const hex = Buffer.from(fs.readFileSync(path.resolve(localFile)), 'utf8').toString('hex');
const chunkSize = 800;
for (let i = 0; i < hex.length; i += chunkSize) {
  const chunk = hex.slice(i, i + chunkSize);
  const code =
    i === 0
      ? `require('fs').writeFileSync('${remoteFile}.hex','${chunk}')`
      : `require('fs').appendFileSync('${remoteFile}.hex','${chunk}')`;
  const status = execRemote(['node', '-e', code]);
  if (status !== 0) process.exit(status);
}

let status = execRemote([
  'node',
  '-e',
  `require('fs').writeFileSync('${remoteFile}', Buffer.from(require('fs').readFileSync('${remoteFile}.hex','utf8'), 'hex'))`,
]);
if (status !== 0) process.exit(status);

status = execRemote(['node', '--input-type=module', remoteFile]);
process.exit(status);
