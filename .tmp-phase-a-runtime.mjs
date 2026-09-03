#!/usr/bin/env node
/** Phase A runtime truth probe — no secrets logged. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const services = {
  'authorization-service': '6a8211d5a21454a2cf6ad783',
  'identity-service': '6a8211cfbdeaa87e2c52df39',
  'activity-service': '6a8211c2a21454a2cf6ad77b',
  'api-gateway': '6a8211c9bdeaa87e2c52df34',
  web: '6a8211dba21454a2cf6ad789',
  admin: '6a8211e2a21454a2cf6ad78e',
  'discord-gateway': '6a8211a6bdeaa87e2c52df28',
};

const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
const token = yaml.match(/token:\s*(\S+)/)?.[1];
if (!token) throw new Error('no zeabur token');

async function gql(query, variables) {
  const res = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

console.log('=== deployments ===');
for (const [name, serviceID] of Object.entries(services)) {
  const result = await gql(
    `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
      deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 2) {
        edges { node { _id status commitSHA createdAt } }
      }
    }`,
    { serviceID, environmentID },
  );
  const edges = result.data?.deployments?.edges ?? [];
  for (const [i, e] of edges.entries()) {
    const n = e.node;
    console.log(
      `${name}[${i}]: ${n.status} sha=${(n.commitSHA || 'upload').slice(0, 12)} id=${n._id} at=${n.createdAt}`,
    );
  }
}

console.log('\n=== public health ===');
for (const [label, url] of [
  ['api/ready', 'https://v2-api.zeabur.app/health/ready'],
  ['api/live', 'https://v2-api.zeabur.app/health'],
  ['web', 'https://v2-web.zeabur.app/health'],
  ['admin', 'https://v2-admin.zeabur.app/health'],
  ['discord', 'https://v22.zeabur.app/health'],
  ['discord/bot', 'https://v22.zeabur.app/health/discord'],
]) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    console.log(`${label}: HTTP ${res.status} ${text.slice(0, 300)}`);
  } catch (error) {
    console.log(`${label}: FAIL ${error instanceof Error ? error.message : error}`);
  }
}

const identityId = services['identity-service'];
const dep = await gql(
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 1) {
      edges { node { _id status } }
    }
  }`,
  { serviceID: identityId, environmentID },
);
const deploymentID = dep.data?.deployments?.edges?.[0]?.node?._id;
console.log(`\n=== identity runtime logs (deployment ${deploymentID}) ===`);
const logs = await gql(
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    runtimeLogs(serviceID: $serviceID, environmentID: $environmentID) {
      message timestamp
    }
  }`,
  { serviceID: identityId, environmentID },
);
if (logs.errors?.length) {
  console.log('runtimeLogs errors:', JSON.stringify(logs.errors));
}
const lines = logs.data?.runtimeLogs ?? [];
for (const entry of lines.slice(-80)) {
  const msg = String(entry.message ?? '').replace(/\u001b\[[0-9;]*m/g, '');
  if (/error|fail|unhealthy|migration|redis|postgres|ECONN|FATAL|ready|listen|started/i.test(msg)) {
    console.log(msg.slice(0, 500));
  }
}
console.log(`(total runtime log lines: ${lines.length})`);
if (lines.length) {
  console.log('--- last 15 raw ---');
  for (const entry of lines.slice(-15)) {
    console.log(String(entry.message ?? '').replace(/\u001b\[[0-9;]*m/g, '').slice(0, 400));
  }
}
