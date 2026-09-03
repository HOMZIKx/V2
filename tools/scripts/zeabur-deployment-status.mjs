#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const services = [
  'authorization-service',
  'identity-service',
  'activity-service',
  'discord-gateway',
  'api-gateway',
  'web',
  'admin',
].map((name) => ({
  name,
  id: {
    'authorization-service': '6a8211d5a21454a2cf6ad783',
    'identity-service': '6a8211cfbdeaa87e2c52df39',
    'activity-service': '6a8211c2a21454a2cf6ad77b',
    'discord-gateway': '6a8211a6bdeaa87e2c52df28',
    'api-gateway': '6a8211c9bdeaa87e2cf6ad34',
    web: '6a8211dba21454a2cf6ad789',
    admin: '6a8211e2a21454a2cf6ad78e',
  }[name],
}));

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
for (const service of services) {
  const result = await gql(
    token,
    `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
      deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 3) {
        edges { node { status commitSHA createdAt } }
      }
    }`,
    { serviceID: service.id, environmentID },
  );
  const nodes = result.data?.deployments?.edges?.map((e) => e.node) ?? [];
  console.log(`\n${service.name}:`);
  for (const n of nodes) {
    console.log(`  ${n.status} ${n.createdAt} sha=${(n.commitSHA ?? 'n/a').slice(0, 12)}`);
  }
}
