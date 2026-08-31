#!/usr/bin/env node
/** Set service dockerfile to full Dockerfile content (required for OCI/upload deploys). */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const repoRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')),
  '../..',
);

const services = [
  { name: 'authorization-service', id: '6a8211d5a21454a2cf6ad783' },
  { name: 'identity-service', id: '6a8211cfbdeaa87e2c52df39' },
  { name: 'activity-service', id: '6a8211c2a21454a2cf6ad77b' },
  { name: 'discord-gateway', id: '6a8211a6bdeaa87e2c52df28' },
  { name: 'api-gateway', id: '6a8211c9bdeaa87e2c52df34' },
  { name: 'web', id: '6a8211dba21454a2cf6ad789' },
  { name: 'admin', id: '6a8211e2a21454a2cf6ad78e' },
];

function readToken() {
  const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
  return yaml.match(/token:\s*(\S+)/)?.[1];
}

async function gql(token, query, variables = {}) {
  const response = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

const token = readToken();
const mode = process.argv[2] ?? 'fix';
const only = process.argv[3];
const list = only ? services.filter((s) => s.name === only) : services;

if (mode === 'fix') {
  for (const service of list) {
    const dockerfilePath = path.join(repoRoot, `Dockerfile.${service.name}`);
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    const upd = await gql(
      token,
      `mutation($serviceID: ObjectID!, $dockerfile: String!) {
        updateDockerfile(serviceID: $serviceID, dockerfile: $dockerfile)
      }`,
      { serviceID: service.id, dockerfile: content },
    );
    const msg = upd.errors?.length ? upd.errors[0].message : `OK (${content.length} chars)`;
    console.log(`${service.name}: ${msg}`);
  }
}

if (mode === 'deploy' || mode === 'all') {
  for (const service of list) {
    console.log(`Deploying ${service.name}...`);
    const proc = spawnSync(
      'npx',
      [
        'zeabur@latest',
        '-i=false',
        'deploy',
        '--service-id',
        service.id,
        '--environment-id',
        environmentID,
        '--name',
        service.name,
      ],
      { encoding: 'utf8', shell: true, cwd: repoRoot, timeout: 600_000 },
    );
    const tail = `${proc.stdout}\n${proc.stderr}`.slice(-400);
    console.log(tail);
    console.log(`exit=${proc.status}\n`);
  }
}
