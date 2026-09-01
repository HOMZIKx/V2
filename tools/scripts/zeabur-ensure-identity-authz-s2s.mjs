#!/usr/bin/env node
/**
 * Ensure identity-service Authorization S2S for login entitlement + identity links.
 */
import { spawnSync } from 'node:child_process';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const identityServiceID = '6a8211cfbdeaa87e2c52df39';
const authzServiceID = '6a8211d5a21454a2cf6ad783';
const DEFAULT_CLIENT_ID = 'v2.identity-service';
const DEFAULT_KID = 'zeabur-identity-authz-active';

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
      updateSingleEnvironmentVariable(serviceID: $serviceID, environmentID: $environmentID, oldKey: $oldKey, newKey: $newKey, value: $value) { key }
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
    if (create.errors?.length) throw new Error(`${key}: update/create failed`);
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

const identityVars = listVars(identityServiceID);
const authzVars = listVars(authzServiceID);

const existingPem = identityVars.get('IDENTITY_TO_AUTHZ_PRIVATE_KEY_PEM') ?? '';
let privatePem = normalizePem(existingPem);
let publicPem;
if (!privatePem.includes('BEGIN PRIVATE KEY')) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  console.log('generated new Ed25519 keypair for identity→authorization');
} else {
  publicPem = createPublicKey({ key: privatePem, format: 'pem', type: 'pkcs8' }).export({
    type: 'spki',
    format: 'pem',
  });
}

const clientId = identityVars.get('IDENTITY_TO_AUTHZ_CLIENT_ID')?.trim() || DEFAULT_CLIENT_ID;
const kid = identityVars.get('IDENTITY_TO_AUTHZ_ACTIVE_KID')?.trim() || DEFAULT_KID;

const authzAud = authzVars.get('AUTHORIZATION_ASSERTION_AUD')?.trim();
const expectedAud =
  authzAud && authzAud.length > 0
    ? authzAud
    : 'https://v2-api.zeabur.app/authorization/v1/authorize';

if ((identityVars.get('IDENTITY_AUTHORIZATION_ASSERTION_AUD')?.trim() ?? '') !== expectedAud) {
  await setVar(token, identityServiceID, 'IDENTITY_AUTHORIZATION_ASSERTION_AUD', expectedAud);
} else {
  console.log('identity assertion aud already aligned');
}

if (identityVars.get('IDENTITY_AUTHORIZATION_ENABLED') !== 'true') {
  await setVar(token, identityServiceID, 'IDENTITY_AUTHORIZATION_ENABLED', 'true');
}

const authzBase = `http://service-${authzServiceID}:8080`;
if ((identityVars.get('IDENTITY_AUTHORIZATION_BASE_URL')?.trim() ?? '') !== authzBase) {
  await setVar(token, identityServiceID, 'IDENTITY_AUTHORIZATION_BASE_URL', authzBase);
}

if (!existingPem.includes('BEGIN PRIVATE KEY')) {
  await setVar(token, identityServiceID, 'IDENTITY_TO_AUTHZ_CLIENT_ID', clientId);
  await setVar(token, identityServiceID, 'IDENTITY_TO_AUTHZ_ACTIVE_KID', kid);
  await setVar(token, identityServiceID, 'IDENTITY_TO_AUTHZ_PRIVATE_KEY_PEM', privatePem);
}

const clients = JSON.parse(authzVars.get('AUTHORIZATION_INBOUND_CLIENTS_JSON') ?? '[]');
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
for (const op of ['authorize', 'identity_link']) {
  allowedOps.add(op);
}
client.allowed_operations = [...allowedOps];

await setVar(token, authzServiceID, 'AUTHORIZATION_INBOUND_CLIENTS_JSON', JSON.stringify(clients));
console.log(`authorization: registered ${clientId} kid=${kid}`);

// Ensure admin origin in trusted origins (merge, do not print values).
const trusted = identityVars.get('IDENTITY_TRUSTED_ORIGINS') ?? '';
const required = ['https://v2-admin.zeabur.app', 'https://v2-web.zeabur.app'];
const parts = trusted
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const merged = new Set(parts);
let trustedChanged = false;
for (const origin of required) {
  if (!merged.has(origin)) {
    merged.add(origin);
    trustedChanged = true;
  }
}
if (trustedChanged) {
  await setVar(token, identityServiceID, 'IDENTITY_TRUSTED_ORIGINS', [...merged].join(','));
  console.log('identity trusted origins updated');
} else {
  console.log('identity trusted origins already include admin+web');
}

for (const serviceID of [authzServiceID, identityServiceID]) {
  const restart = await gql(
    token,
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) { restartService(serviceID: $serviceID, environmentID: $environmentID) }`,
    { serviceID, environmentID },
  );
  console.log(
    `restart ${serviceID.slice(-6)}:`,
    restart.data?.restartService === true ? 'ok' : 'fail',
  );
}
