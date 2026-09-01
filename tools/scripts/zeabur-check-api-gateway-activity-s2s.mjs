#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const activityServiceID = '6a8211c2a21454a2cf6ad77b';
const gatewayServiceID = '6a8211c9bdeaa87e2c52df34';

function listVars(serviceID) {
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
  const map = new Map();
  for (const row of [...(parsed.variables ?? []), ...(parsed.readonlyVariables ?? [])]) {
    map.set(row.key, row.value ?? '');
  }
  return map;
}

const activity = listVars(activityServiceID);
const gateway = listVars(gatewayServiceID);
let gatewayClientPresent = false;
let gatewayKeyMatch = false;
try {
  const clients = JSON.parse(activity.get('ACTIVITY_INBOUND_CLIENTS_JSON') ?? '[]');
  const clientId = gateway.get('API_TO_ACTIVITY_CLIENT_ID') ?? 'v2.api-gateway';
  const kid = gateway.get('API_TO_ACTIVITY_ACTIVE_KID') ?? '';
  const client = clients.find((c) => c.client_id === clientId);
  gatewayClientPresent = client !== undefined;
  gatewayKeyMatch = client?.keys?.some((k) => k.kid === kid && k.status === 'active') === true;
} catch {
  gatewayClientPresent = false;
}
console.log(
  'gateway_to_activity_keys',
  [
    'API_TO_ACTIVITY_PRIVATE_KEY_PEM',
    'API_TO_ACTIVITY_ACTIVE_KID',
    'API_TO_ACTIVITY_CLIENT_ID',
  ].every((k) => Boolean(gateway.get(k))),
);
console.log('activity_inbound_gateway_client', gatewayClientPresent);
console.log('activity_inbound_gateway_kid_match', gatewayKeyMatch);
