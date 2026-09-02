#!/usr/bin/env node
/** Validate Authorization inbound registry for activity client — booleans only. */
import { spawnSync } from 'node:child_process';

const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const activityServiceID = '6a8211c2a21454a2cf6ad77b';
const authzServiceID = '6a8211d5a21454a2cf6ad783';

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
const authz = listVars(authzServiceID);
const kid = activity.get('ACTIVITY_TO_AUTHZ_ACTIVE_KID')?.trim() ?? '';
const clientId = activity.get('ACTIVITY_TO_AUTHZ_CLIENT_ID')?.trim() ?? 'v2.activity-service';
let parseOk = false;
let clientPresent = false;
let keyMatch = false;
let authorizeOp = false;
try {
  const clients = JSON.parse(authz.get('AUTHORIZATION_INBOUND_CLIENTS_JSON') ?? '[]');
  parseOk = Array.isArray(clients);
  const client = clients.find((c) => c.client_id === clientId);
  clientPresent = client !== undefined;
  authorizeOp = client?.allowed_operations?.includes('authorize') === true;
  keyMatch =
    client?.keys?.some(
      (k) => k.kid === kid && k.status === 'active' && typeof k.public_key_pem === 'string',
    ) === true;
} catch {
  parseOk = false;
}
console.log('inbound_json_parse_ok', parseOk);
console.log('activity_client_present', clientPresent);
console.log('activity_authorize_op', authorizeOp);
console.log('activity_active_kid_match', keyMatch);
