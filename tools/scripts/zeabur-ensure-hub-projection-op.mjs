#!/usr/bin/env node
/**
 * Ensure ACTIVITY_INBOUND_CLIENTS_JSON includes activity_hub_projection for discord-gateway.
 * Does not print secrets — only reports whether the op was added.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const serviceID = '6a8211c2a21454a2cf6ad77b';
const OP = 'activity_hub_projection';

function readToken() {
  const fromEnv = process.env.ZEABUR_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
  const match = yaml.match(/token:\s*(\S+)/);
  if (!match) throw new Error('No Zeabur token');
  return match[1];
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
const listed = spawnSync(
  'npx',
  [
    'zeabur@latest',
    '-i=false',
    'variable',
    'list',
    '--id',
    serviceID,
    '--env-id',
    environmentID,
    '--json',
  ],
  { encoding: 'utf8', shell: true },
);
const jsonStart = listed.stdout.indexOf('{');
const parsed = JSON.parse(listed.stdout.slice(jsonStart));
const vars = [...(parsed.variables ?? []), ...(parsed.readonlyVariables ?? [])];
const inbound = vars.find((v) => v.key === 'ACTIVITY_INBOUND_CLIENTS_JSON');
if (!inbound?.value) {
  console.error('ACTIVITY_INBOUND_CLIENTS_JSON missing');
  process.exit(1);
}

const clients = JSON.parse(inbound.value);
if (!Array.isArray(clients)) {
  console.error('inbound clients is not an array');
  process.exit(1);
}

let changed = false;
for (const client of clients) {
  if (client.client_id !== 'v2.discord-gateway') continue;
  const ops = Array.isArray(client.allowed_operations) ? [...client.allowed_operations] : [];
  if (!ops.includes(OP)) {
    ops.push(OP);
    client.allowed_operations = ops;
    changed = true;
  }
  // Ensure hub projection can run without full product mutate if ops were empty
  for (const required of ['activity_hub_projection']) {
    if (!client.allowed_operations.includes(required)) {
      client.allowed_operations.push(required);
      changed = true;
    }
  }
}

if (!changed) {
  console.log('activity_hub_projection: already present');
  process.exit(0);
}

const nextValue = JSON.stringify(clients);
const update = await gql(
  token,
  `mutation($serviceID: ObjectID!, $environmentID: ObjectID!, $oldKey: String!, $newKey: String!, $value: String!) {
    updateSingleEnvironmentVariable(
      serviceID: $serviceID
      environmentID: $environmentID
      oldKey: $oldKey
      newKey: $newKey
      value: $value
    ) { key }
  }`,
  {
    serviceID,
    environmentID,
    oldKey: 'ACTIVITY_INBOUND_CLIENTS_JSON',
    newKey: 'ACTIVITY_INBOUND_CLIENTS_JSON',
    value: nextValue,
  },
);
if (update.errors?.length) {
  console.error('update failed', update.errors[0]?.message);
  process.exit(1);
}
console.log('activity_hub_projection: added to v2.discord-gateway allowed_operations');
