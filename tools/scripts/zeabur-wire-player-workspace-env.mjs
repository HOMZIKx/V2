#!/usr/bin/env node
/**
 * Wire player-workspace-service on Zeabur TEST.
 * Creates isolated player_workspace DB via GraphQL, sets env, restarts.
 * Never prints secret values.
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const activityServiceID = '6a8211c2a21454a2cf6ad77b';
const identityServiceID = '6a8211cfbdeaa87e2c52df39';
const apiGatewayServiceID = '6a8211c9bdeaa87e2c52df34';
const postgresServiceID = '6a821138a21454a2cf6ad74d';
const redisServiceID = '6a82113da21454a2cf6ad75a';
const pwServiceID = process.env.ZEABUR_PW_SERVICE_ID?.trim() ?? '6a9885bb573ada8b3bbe5f1f';
const DB_NAME = 'player_workspace';

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

async function listVars(token, serviceID) {
  const result = await gql(
    token,
    `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
      service(_id: $serviceID) {
        variables(environmentID: $environmentID) { key value }
      }
    }`,
    { serviceID, environmentID },
  );
  if (result.errors?.length) {
    throw new Error(`listVars ${serviceID}: ${result.errors[0].message}`);
  }
  return new Map((result.data?.service?.variables ?? []).map((row) => [row.key, row.value ?? '']));
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
      throw new Error(`${key}: ${create.errors[0]?.message ?? 'set failed'}`);
    }
  }
  console.log(`${serviceID.slice(-6)} ${key}: OK`);
}

function normalizePem(value) {
  return String(value).replace(/\\n/g, '\n').trim();
}

function derivePublicPem(privatePem) {
  return createPublicKey(createPrivateKey(normalizePem(privatePem)))
    .export({ type: 'spki', format: 'pem' })
    .toString();
}

function hostHint(urlLike) {
  try {
    const u = new URL(urlLike);
    return `${u.protocol}//${u.hostname}:${u.port || '(default)'}${u.pathname}`;
  } catch {
    return '(unparseable)';
  }
}

function resolveRef(value, maps) {
  let current = value ?? '';
  for (let i = 0; i < 8; i += 1) {
    if (!current.includes('${')) return current;
    current = current.replace(/\$\{([^}]+)\}/g, (_, key) => {
      for (const map of maps) {
        if (map.has(key)) return map.get(key) ?? '';
      }
      return '';
    });
  }
  return current;
}

const token = readToken();
if (!token) {
  console.error('No Zeabur token');
  process.exit(1);
}

console.log('Loading vars…');
const activityVars = await listVars(token, activityServiceID);
const gwVars = await listVars(token, apiGatewayServiceID);
const identityVars = await listVars(token, identityServiceID);
const postgresVars = await listVars(token, postgresServiceID);
const pwVars = await listVars(token, pwServiceID);
const maps = [postgresVars, activityVars, pwVars, gwVars, identityVars];

const existing = await gql(
  token,
  `query($environmentID: ObjectID!, $serviceID: ObjectID!) {
    postgresDatabases(environmentID: $environmentID, serviceID: $serviceID) { name }
  }`,
  { environmentID, serviceID: postgresServiceID },
);
const dbNames = (existing.data?.postgresDatabases ?? []).map((d) => d.name);
console.log('postgresDatabases:', dbNames.join(', '));
if (!dbNames.includes(DB_NAME)) {
  const created = await gql(
    token,
    `mutation($environmentID: ObjectID!, $serviceID: ObjectID!, $name: String!) {
      createPostgresDatabase(environmentID: $environmentID, serviceID: $serviceID, name: $name)
    }`,
    { environmentID, serviceID: postgresServiceID, name: DB_NAME },
  );
  if (created.errors?.length) {
    console.error('createPostgresDatabase failed:', created.errors[0]?.message);
    process.exit(1);
  }
  console.log(`DB ${DB_NAME}: CREATED`);
} else {
  console.log(`DB ${DB_NAME}: EXISTS`);
}

const host = resolveRef(
  activityVars.get('POSTGRES_HOST') || postgresVars.get('POSTGRES_HOST'),
  maps,
);
const port = resolveRef(activityVars.get('POSTGRES_PORT') || '5432', maps) || '5432';
const user = resolveRef(
  postgresVars.get('POSTGRES_USER') || postgresVars.get('POSTGRES_USERNAME'),
  maps,
);
const password = resolveRef(
  postgresVars.get('PASSWORD') || postgresVars.get('POSTGRES_PASSWORD'),
  maps,
);
if (!host || !user || !password) {
  console.error('Could not resolve postgres host/user/password');
  process.exit(1);
}

const pwDbUrl = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${DB_NAME}`;
console.log('PLAYER_WORKSPACE_DATABASE_URL host:', hostHint(pwDbUrl));
await setVar(token, pwServiceID, 'PLAYER_WORKSPACE_DATABASE_URL', pwDbUrl);

const redisVars = await listVars(token, redisServiceID);
maps.push(redisVars);
const redisHost = resolveRef(activityVars.get('REDIS_HOST'), maps);
const redisPort = resolveRef(activityVars.get('REDIS_PORT'), maps) || '6379';
const redisPassword = resolveRef(
  redisVars.get('PASSWORD') || redisVars.get('REDIS_PASSWORD'),
  maps,
);
if (!redisHost || !redisPassword) {
  console.error('Could not resolve Redis host/password for assertion JTI store');
  process.exit(1);
}
await setVar(
  token,
  pwServiceID,
  'PLAYER_WORKSPACE_REDIS_URL',
  `redis://:${encodeURIComponent(redisPassword)}@${redisHost}:${redisPort}`,
);
console.log(`PLAYER_WORKSPACE_REDIS_URL host=${redisHost} port=${redisPort}`);

// Zeabur platform PORT is typically ${WEB_PORT} → 8080; use concrete 8080 for
// SERVICE_PORT and gateway base URL (refs inside URLs do not expand).
const listenPort = '8080';
await setVar(token, pwServiceID, 'PLAYER_WORKSPACE_SERVICE_HOST', '0.0.0.0');
await setVar(token, pwServiceID, 'PLAYER_WORKSPACE_SERVICE_PORT', listenPort);
await setVar(token, pwServiceID, 'NODE_ENV', 'production');
await setVar(token, pwServiceID, 'PLAYER_WORKSPACE_TRUST_ACTOR_HEADERS', '0');
await setVar(token, pwServiceID, 'PLAYER_WORKSPACE_ASSERTION_AUD', 'v2.player-workspace-service');

let apiPem = gwVars.get('API_TO_PLAYER_WORKSPACE_PRIVATE_KEY_PEM')?.trim();
let apiKid = gwVars.get('API_TO_PLAYER_WORKSPACE_ACTIVE_KID')?.trim();
if (!apiPem || !apiPem.includes('BEGIN PRIVATE KEY')) {
  apiPem = gwVars.get('API_TO_ACTIVITY_PRIVATE_KEY_PEM')?.trim();
  apiKid = gwVars.get('API_TO_ACTIVITY_ACTIVE_KID')?.trim() || 'api-gateway-1';
}
if (!apiPem || !apiPem.includes('BEGIN PRIVATE KEY')) {
  const generated = generateKeyPairSync('ed25519');
  apiPem = generated.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  apiKid = `api-pw-${randomBytes(4).toString('hex')}`;
  console.log('generated API_TO_PLAYER_WORKSPACE keypair');
}

const publicPem = derivePublicPem(apiPem);
await setVar(
  token,
  pwServiceID,
  'PLAYER_WORKSPACE_INBOUND_CLIENTS_JSON',
  JSON.stringify([
    {
      client_id: 'v2.api-gateway',
      keys: [{ kid: apiKid, status: 'active', public_key_pem: publicPem }],
      allowed_operations: [],
    },
  ]),
);

const activityBase = gwVars.get('ACTIVITY_SERVICE_BASE_URL')?.trim() ?? '';
const pwBase = activityBase.includes('service-')
  ? `http://service-${pwServiceID}:${listenPort}`
  : `http://service-${pwServiceID}:${listenPort}`;
console.log('PLAYER_WORKSPACE_SERVICE_BASE_URL:', hostHint(pwBase));
await setVar(token, apiGatewayServiceID, 'PLAYER_WORKSPACE_SERVICE_BASE_URL', pwBase);
await setVar(
  token,
  apiGatewayServiceID,
  'API_TO_PLAYER_WORKSPACE_PRIVATE_KEY_PEM',
  normalizePem(apiPem),
);
await setVar(token, apiGatewayServiceID, 'API_TO_PLAYER_WORKSPACE_ACTIVE_KID', apiKid);
await setVar(
  token,
  apiGatewayServiceID,
  'PLAYER_WORKSPACE_ASSERTION_AUD',
  'v2.player-workspace-service',
);

const identityPort = identityVars.get('PORT')?.trim() || '8080';
const identityBase =
  activityVars.get('ACTIVITY_IDENTITY_BASE_URL')?.trim() ||
  `http://service-${identityServiceID}:${identityPort}`;
const ownershipUrl =
  identityVars.get('IDENTITY_CHARACTER_OWNERSHIP_URL')?.trim() ||
  'https://v2-api.zeabur.app/identity/v1/internal/character/ownership';
if (!ownershipUrl.startsWith('https://')) {
  // Production Identity requires https AUDs (same pattern as CHARACTER_RESOLVE_URL).
  console.error('IDENTITY_CHARACTER_OWNERSHIP_URL must be https in production');
  process.exit(1);
}

await setVar(
  token,
  pwServiceID,
  'PLAYER_WORKSPACE_IDENTITY_BASE_URL',
  identityBase.replace(/\/$/, ''),
);
await setVar(token, pwServiceID, 'PLAYER_WORKSPACE_IDENTITY_OWNERSHIP_ASSERTION_AUD', ownershipUrl);
console.log('identity ownership aud:', hostHint(ownershipUrl));

let pwToIdPem = activityVars.get('ACTIVITY_TO_IDENTITY_PRIVATE_KEY_PEM')?.trim();
let pwToIdKid = activityVars.get('ACTIVITY_TO_IDENTITY_ACTIVE_KID')?.trim();
if (!pwToIdPem || !pwToIdPem.includes('BEGIN PRIVATE KEY')) {
  const generated = generateKeyPairSync('ed25519');
  pwToIdPem = generated.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  pwToIdKid = `pw-id-${randomBytes(4).toString('hex')}`;
  console.log('generated PLAYER_WORKSPACE_TO_IDENTITY keypair');
}
await setVar(
  token,
  pwServiceID,
  'PLAYER_WORKSPACE_TO_IDENTITY_PRIVATE_KEY_PEM',
  normalizePem(pwToIdPem),
);
await setVar(
  token,
  pwServiceID,
  'PLAYER_WORKSPACE_TO_IDENTITY_ACTIVE_KID',
  pwToIdKid || 'pw-identity-1',
);
await setVar(
  token,
  pwServiceID,
  'PLAYER_WORKSPACE_TO_IDENTITY_CLIENT_ID',
  'v2.player-workspace-service',
);

const inboundIdentityRaw = identityVars.get('IDENTITY_INBOUND_CLIENTS_JSON')?.trim() ?? '[]';
let inboundIdentity;
try {
  inboundIdentity = JSON.parse(inboundIdentityRaw);
} catch {
  inboundIdentity = [];
}
if (!Array.isArray(inboundIdentity)) inboundIdentity = [];
const pwPublic = derivePublicPem(pwToIdPem);
const withoutPw = inboundIdentity.filter((c) => c?.client_id !== 'v2.player-workspace-service');
withoutPw.push({
  client_id: 'v2.player-workspace-service',
  keys: [{ kid: pwToIdKid || 'pw-identity-1', status: 'active', public_key_pem: pwPublic }],
  allowed_operations: [],
});
await setVar(token, identityServiceID, 'IDENTITY_INBOUND_CLIENTS_JSON', JSON.stringify(withoutPw));
if (!identityVars.get('IDENTITY_CHARACTER_OWNERSHIP_URL')?.trim()) {
  await setVar(token, identityServiceID, 'IDENTITY_CHARACTER_OWNERSHIP_URL', ownershipUrl);
}

async function restart(serviceID, label) {
  const result = await gql(
    token,
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) {
      restartService(serviceID: $serviceID, environmentID: $environmentID)
    }`,
    { serviceID, environmentID },
  );
  if (result.errors?.length) {
    throw new Error(`${label} restart: ${result.errors[0]?.message}`);
  }
  console.log(`restart ${label}: OK`);
}

await restart(pwServiceID, 'player-workspace-service');
await restart(apiGatewayServiceID, 'api-gateway');
await restart(identityServiceID, 'identity-service');
console.log('DONE');
