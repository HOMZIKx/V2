#!/usr/bin/env node
/**
 * Ensure activity-service Authorization S2S: register SPKI from ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM
 * in AUTHORIZATION_INBOUND_CLIENTS_JSON and align assertion AUD. Does not print secrets.
 */
import { spawnSync } from 'node:child_process';
import { createPublicKey } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const activityServiceID = '6a8211c2a21454a2cf6ad77b';
const authzServiceID = '6a8211d5a21454a2cf6ad783';
const DEFAULT_CLIENT_ID = 'v2.activity-service';
const AUTHORIZE_AUD_SUFFIX = '/authorization/v1/authorize';

function readToken() {
  const fromEnv = process.env.ZEABUR_TOKEN?.trim();
  if (fromEnv) return fromEnv;
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

async function setVar(token, serviceID, key, value) {
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
    { serviceID, environmentID, oldKey: key, newKey: key, value },
  );
  if (update.errors?.length) {
    const create = await gql(
      token,
      `mutation($serviceID: ObjectID!, $environmentID: ObjectID!, $key: String!, $value: String!) {
        createEnvironmentVariable(serviceID: $serviceID, environmentID: $environmentID, key: $key, value: $value) { key }
      }`,
      { serviceID, environmentID, key, value },
    );
    if (create.errors?.length) {
      throw new Error(`${key}: update/create failed`);
    }
  }
  console.log(`${serviceID.slice(-6)} ${key}: OK`);
}

function normalizePem(value) {
  return String(value).replace(/\\n/g, '\n').trim();
}

const token = readToken();
if (!token) {
  console.error('No Zeabur token');
  process.exit(1);
}

const activityVars = listVars(activityServiceID);
const authzVars = listVars(authzServiceID);

const privatePem = normalizePem(activityVars.get('ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM') ?? '');
if (!privatePem.includes('BEGIN PRIVATE KEY')) {
  console.error('ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM missing on activity-service');
  process.exit(1);
}

const clientId = activityVars.get('ACTIVITY_TO_AUTHZ_CLIENT_ID')?.trim() || DEFAULT_CLIENT_ID;
const kid = activityVars.get('ACTIVITY_TO_AUTHZ_ACTIVE_KID')?.trim();
if (kid === undefined || kid.length === 0) {
  console.error('ACTIVITY_TO_AUTHZ_ACTIVE_KID missing on activity-service');
  process.exit(1);
}

const authzAud = authzVars.get('AUTHORIZATION_ASSERTION_AUD')?.trim();
const expectedAud =
  authzAud && authzAud.length > 0 ? authzAud : `https://v2-api.zeabur.app${AUTHORIZE_AUD_SUFFIX}`;

const currentActivityAud = activityVars.get('ACTIVITY_AUTHORIZATION_ASSERTION_AUD')?.trim() ?? '';
if (currentActivityAud !== expectedAud) {
  await setVar(token, activityServiceID, 'ACTIVITY_AUTHORIZATION_ASSERTION_AUD', expectedAud);
  console.log('activity assertion aud aligned');
} else {
  console.log('activity assertion aud already aligned');
}

const publicPem = createPublicKey({ key: privatePem, format: 'pem', type: 'pkcs8' }).export({
  type: 'spki',
  format: 'pem',
});

const clientsJson = authzVars.get('AUTHORIZATION_INBOUND_CLIENTS_JSON');
if (clientsJson === undefined || clientsJson.length === 0) {
  console.error('AUTHORIZATION_INBOUND_CLIENTS_JSON missing');
  process.exit(1);
}

const clients = JSON.parse(clientsJson);
let client = clients.find((c) => c.client_id === clientId);
if (client === undefined) {
  client = { client_id: clientId, keys: [], allowed_operations: [] };
  clients.push(client);
}

const keys = Array.isArray(client.keys) ? client.keys : [];
const existing = keys.find((k) => k.kid === kid);
if (existing === undefined) {
  keys.push({ kid, status: 'active', public_key_pem: publicPem });
} else {
  existing.public_key_pem = publicPem;
  existing.status = 'active';
}
client.keys = keys;

const allowedOps = new Set(
  Array.isArray(client.allowed_operations) ? client.allowed_operations : [],
);
allowedOps.add('authorize');
client.allowed_operations = [...allowedOps];

await setVar(token, authzServiceID, 'AUTHORIZATION_INBOUND_CLIENTS_JSON', JSON.stringify(clients));
console.log(`authorization: registered client ${clientId} kid=${kid}`);

for (const serviceID of [authzServiceID, activityServiceID]) {
  const restart = await gql(
    token,
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) {
      restartService(serviceID: $serviceID, environmentID: $environmentID)
    }`,
    { serviceID, environmentID },
  );
  console.log(
    `restart ${serviceID.slice(-6)}:`,
    restart.data?.restartService === true ? 'ok' : 'fail',
  );
}
