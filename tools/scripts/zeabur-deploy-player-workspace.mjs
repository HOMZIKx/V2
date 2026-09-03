import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const environmentID = '6a720a3e5f062718bc7b3421';
const serviceID = '6a9885bb573ada8b3bbe5f1f';
const serviceName = 'player-workspace-service';
const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
const token = yaml.match(/token:\s*(\S+)/)?.[1];

async function gql(query, variables = {}) {
  const response = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

const content = fs.readFileSync(path.join(ROOT, 'Dockerfile.player-workspace-service'), 'utf8');
const upd = await gql(
  `mutation($serviceID: ObjectID!, $dockerfile: String!) {
    updateDockerfile(serviceID: $serviceID, dockerfile: $dockerfile)
  }`,
  { serviceID, dockerfile: content },
);
if (upd.errors?.length) {
  console.error('updateDockerfile FAIL', upd.errors[0]?.message);
  process.exit(1);
}
console.log(`dockerfile synced bytes=${content.length}`);

const proc = spawnSync(
  'npx',
  [
    'zeabur@latest',
    '-i=false',
    'deploy',
    '--service-id',
    serviceID,
    '--environment-id',
    environmentID,
    '--name',
    serviceName,
  ],
  { cwd: ROOT, encoding: 'utf8', shell: true, timeout: 600_000, env: process.env },
);
console.log((proc.stdout + '\n' + proc.stderr).slice(-800));
console.log(`exit=${proc.status}`);
