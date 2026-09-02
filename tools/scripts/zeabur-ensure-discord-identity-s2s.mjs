#!/usr/bin/env node
/**
 * Ensure discord-gateway has Identity S2S profile assertion env and Identity registers the client.
 * Does not print secrets.
 */
import { spawnSync } from 'node:child_process';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const discordServiceID = '6a8211a6bdeaa87e2c52df28';
const identityServiceID = '6a8211cfbdeaa87e2c52df39';
const CLIENT_ID = 'v2.discord-gateway';
const KID = 'zeabur-discord-identity-active';
const PROFILE_ASSERTION_AUD = 'https://v2-api.zeabur.app/identity/v1/internal/profile';
const IDENTITY_INTERNAL_BASE = 'http://service-6a8211cfbdeaa87e2c52df39:8080';

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

async function listVars(serviceID) {
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
  return [...(parsed.variables ?? []), ...(parsed.readonlyVariables ?? [])];
}

async function setVar(token, serviceID, key, value) {
  const create = await gql(
    token,
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!, $key: String!, $value: String!) {
      createEnvironmentVariable(serviceID: $serviceID, environmentID: $environmentID, key: $key, value: $value) { key }
    }`,
    { serviceID, environmentID, key, value },
  );
  if (!create.errors?.length) return;
  const result = await gql(
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
  if (result.errors?.length) {
    throw new Error(`${key}: ${result.errors[0]?.message ?? 'update failed'}`);
  }
}

function normalizePem(value) {
  return String(value).replace(/\\n/g, '\n').trim();
}

const token = readToken();
if (!token) {
  console.error('No Zeabur token');
  process.exit(1);
}

const discordVars = await listVars(discordServiceID);
const existingPemEntry = discordVars.find((v) => v.key === 'DISCORD_TO_IDENTITY_PRIVATE_KEY_PEM');
const hasIdentityPem =
  existingPemEntry?.value !== undefined && existingPemEntry.value.includes('BEGIN PRIVATE KEY');

let privatePem;
let publicPem;
if (!hasIdentityPem) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  console.log('generated new Ed25519 keypair for discord→identity');
} else {
  console.log('DISCORD_TO_IDENTITY_PRIVATE_KEY_PEM: already present');
  privatePem = normalizePem(existingPemEntry.value);
  publicPem = createPublicKey({ key: privatePem, format: 'pem', type: 'pkcs8' }).export({
    type: 'spki',
    format: 'pem',
  });
}

const identityVars = await listVars(identityServiceID);
const clientsEntry = identityVars.find((v) => v.key === 'IDENTITY_SERVICE_CLIENTS_JSON');
if (!clientsEntry?.value) {
  console.error('IDENTITY_SERVICE_CLIENTS_JSON missing on identity-service');
  process.exit(1);
}
const clients = JSON.parse(clientsEntry.value);
let client = clients.find((c) => c.client_id === CLIENT_ID);
if (client === undefined) {
  client = { client_id: CLIENT_ID, allowed_audiences: [], keys: [] };
  clients.push(client);
}
const audiences = new Set(Array.isArray(client.allowed_audiences) ? client.allowed_audiences : []);
audiences.add(PROFILE_ASSERTION_AUD);
client.allowed_audiences = [...audiences];

if (publicPem !== undefined) {
  const keys = Array.isArray(client.keys) ? client.keys : [];
  const existing = keys.find((k) => k.kid === KID);
  if (existing === undefined) {
    keys.push({ kid: KID, status: 'active', public_key_pem: publicPem });
  } else {
    existing.public_key_pem = publicPem;
    existing.status = 'active';
  }
  client.keys = keys;
}

await setVar(token, identityServiceID, 'IDENTITY_SERVICE_CLIENTS_JSON', JSON.stringify(clients));
await setVar(token, identityServiceID, 'IDENTITY_INTERNAL_PROFILE_READ_URL', PROFILE_ASSERTION_AUD);
console.log('identity: clients JSON + profile assertion aud updated');

if (!hasIdentityPem && privatePem !== undefined) {
  await setVar(token, discordServiceID, 'DISCORD_TO_IDENTITY_CLIENT_ID', CLIENT_ID);
  await setVar(token, discordServiceID, 'DISCORD_TO_IDENTITY_ACTIVE_KID', KID);
  await setVar(token, discordServiceID, 'DISCORD_TO_IDENTITY_PRIVATE_KEY_PEM', privatePem);
}
await setVar(token, discordServiceID, 'IDENTITY_ASSERTION_AUD', PROFILE_ASSERTION_AUD);
await setVar(token, discordServiceID, 'IDENTITY_SERVICE_BASE_URL', 'https://v2-api.zeabur.app');
await setVar(token, discordServiceID, 'ACTIVITY_CLIENT_MODE', 'assertion');
console.log('discord-gateway: identity S2S env updated');

for (const serviceID of [identityServiceID, discordServiceID]) {
  const restart = await gql(
    token,
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) {
      restartService(serviceID: $serviceID, environmentID: $environmentID)
    }`,
    { serviceID, environmentID },
  );
  console.log(`restart ${serviceID}:`, restart.data?.restartService === true ? 'ok' : 'failed');
}
