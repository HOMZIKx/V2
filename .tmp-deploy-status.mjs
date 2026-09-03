#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const services = {
  admin: '6a8211e2a21454a2cf6ad78e',
  web: '6a8211dba21454a2cf6ad789',
  'api-gateway': '6a8211c9bdeaa87e2c52df34',
  'identity-service': '6a8211cfbdeaa87e2c52df39',
  'activity-service': '6a8211c2a21454a2cf6ad77b',
  'discord-gateway': '6a8211a6bdeaa87e2c52df28',
  'authorization-service': '6a8211d5a21454a2cf6ad783',
};

const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
const token = yaml.match(/token:\s*(\S+)/)?.[1];

async function gql(query, variables) {
  const res = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

for (const [name, serviceID] of Object.entries(services)) {
  const result = await gql(
    `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
      deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 1) {
        edges { node { status commitSHA createdAt } }
      }
    }`,
    { serviceID, environmentID },
  );
  const node = result.data?.deployments?.edges?.[0]?.node;
  console.log(
    `${name}: ${node?.status ?? result.errors?.[0]?.message ?? '?'} sha=${(node?.commitSHA ?? 'upload').slice(0, 12)}`,
  );
}

for (const [label, url] of [
  ['admin', 'https://v2-admin.zeabur.app/health'],
  ['web', 'https://v2-web.zeabur.app/health'],
  ['api', 'https://v2-api.zeabur.app/health/ready'],
]) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    console.log(`${label} health: ${res.status} ${(await res.text()).slice(0, 160)}`);
  } catch (error) {
    console.log(`${label} health: FAIL ${error instanceof Error ? error.message : error}`);
  }
}
