#!/usr/bin/env node
/**
 * Safe runtime S2S probes for Stage 5 closure. Never prints private keys or assertion tokens.
 */
import { spawnSync } from 'node:child_process';
import { createPrivateKey, randomUUID, sign } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const activityServiceID = '6a8211c2a21454a2cf6ad77b';
const discordServiceID = '6a8211a6bdeaa87e2c52df28';
const API_BASE = 'https://v2-api.zeabur.app';

function listVarMap(serviceID) {
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
  if (jsonStart < 0) {
    throw new Error(`Could not parse Zeabur variable list for ${serviceID}`);
  }
  const parsed = JSON.parse(listed.stdout.slice(jsonStart));
  const rows = [...(parsed.variables ?? []), ...(parsed.readonlyVariables ?? [])];
  const map = new Map();
  for (const row of rows) {
    const key = row.key ?? row.name;
    if (typeof key === 'string') map.set(key, row.value ?? '');
  }
  return map;
}

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signAssertion({ clientId, kid, privateKeyPem, aud, ttlSeconds, extraClaims = {} }) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'EdDSA', kid, typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      jti: randomUUID(),
      iss: clientId,
      sub: clientId,
      aud,
      iat: now,
      exp: now + ttlSeconds,
      ...extraClaims,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const key = createPrivateKey(privateKeyPem);
  const signature = sign(null, Buffer.from(signingInput), key);
  return `${signingInput}.${base64Url(signature)}`;
}

function classify(status, body) {
  if (status === 401 || status === 403) return 'FAIL_AUTH';
  if (status === 404 && body.includes('Cannot GET')) return 'FAIL_ROUTE';
  if (status >= 400 && status < 500) return 'PASS_S2S'; // assertion accepted, validation/business error
  if (status >= 200 && status < 300) return 'PASS_OK';
  return 'FAIL_OTHER';
}

async function probe(name, url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
  const text = await response.text();
  const verdict = classify(response.status, text);
  const code = (() => {
    try {
      return JSON.parse(text)?.error?.code ?? JSON.parse(text)?.code ?? null;
    } catch {
      return null;
    }
  })();
  console.log(`${name}: HTTP ${response.status} verdict=${verdict}${code ? ` code=${code}` : ''}`);
  return { name, status: response.status, verdict, pass: verdict.startsWith('PASS') };
}

const activityVars = listVarMap(activityServiceID);
const discordVars = listVarMap(discordServiceID);

console.log('ACTIVITY_ENABLED=', activityVars.get('ACTIVITY_ENABLED') ?? '(missing)');
console.log(
  'activity identity keys present=',
  [
    'ACTIVITY_IDENTITY_BASE_URL',
    'ACTIVITY_IDENTITY_CHARACTER_ASSERTION_AUD',
    'ACTIVITY_TO_IDENTITY_PRIVATE_KEY_PEM',
    'ACTIVITY_TO_IDENTITY_ACTIVE_KID',
  ].every((k) => Boolean(activityVars.get(k))),
);
console.log(
  'activity authz keys present=',
  [
    'ACTIVITY_AUTHORIZATION_BASE_URL',
    'ACTIVITY_AUTHORIZATION_ASSERTION_AUD',
    'ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM',
    'ACTIVITY_TO_AUTHZ_ACTIVE_KID',
  ].every((k) => Boolean(activityVars.get(k))),
);

const results = [];

if (
  activityVars.get('ACTIVITY_TO_IDENTITY_PRIVATE_KEY_PEM') &&
  activityVars.get('ACTIVITY_IDENTITY_CHARACTER_ASSERTION_AUD')
) {
  const assertion = signAssertion({
    clientId: activityVars.get('ACTIVITY_TO_IDENTITY_CLIENT_ID') ?? 'v2.activity-service',
    kid: activityVars.get('ACTIVITY_TO_IDENTITY_ACTIVE_KID'),
    privateKeyPem: activityVars.get('ACTIVITY_TO_IDENTITY_PRIVATE_KEY_PEM'),
    aud: activityVars.get('ACTIVITY_IDENTITY_CHARACTER_ASSERTION_AUD'),
    ttlSeconds: Number(activityVars.get('ACTIVITY_CLIENT_ASSERTION_MAX_TTL_SECONDS') ?? 60),
  });
  results.push(
    await probe('ACTIVITY_TO_IDENTITY_S2S', `${API_BASE}/identity/v1/internal/character/resolve`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'identity-client-assertion': assertion,
      },
      body: JSON.stringify({
        discordUserId: '000000000000000001',
        characterId: '00000000-0000-4000-8000-000000000001',
        sessionRoles: ['DPS'],
      }),
    }),
  );
} else {
  console.log('ACTIVITY_TO_IDENTITY_S2S: SKIP missing env');
}

if (
  activityVars.get('ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM') &&
  activityVars.get('ACTIVITY_AUTHORIZATION_ASSERTION_AUD')
) {
  const assertion = signAssertion({
    clientId: activityVars.get('ACTIVITY_TO_AUTHZ_CLIENT_ID') ?? 'v2.activity-service',
    kid: activityVars.get('ACTIVITY_TO_AUTHZ_ACTIVE_KID'),
    privateKeyPem: activityVars.get('ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM'),
    aud: activityVars.get('ACTIVITY_AUTHORIZATION_ASSERTION_AUD'),
    ttlSeconds: Number(activityVars.get('ACTIVITY_CLIENT_ASSERTION_MAX_TTL_SECONDS') ?? 60),
  });
  results.push(
    await probe('ACTIVITY_TO_AUTHORIZATION_S2S', `${API_BASE}/authorization/v1/authorize`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization-client-assertion': assertion,
      },
      body: JSON.stringify({
        subject: { discordUserId: '000000000000000001' },
        permissionId: 'permission.activity.event.read',
        scope: { guildId: '1534228693017432124' },
        operationClass: 'ordinary',
      }),
    }),
  );
} else {
  console.log('ACTIVITY_TO_AUTHORIZATION_S2S: SKIP missing env');
}

if (
  discordVars.get('DISCORD_TO_IDENTITY_PRIVATE_KEY_PEM') &&
  discordVars.get('IDENTITY_ASSERTION_AUD')
) {
  const operatorId =
    (discordVars.get('DISCORD_TEST_OPERATOR_IDS') ?? '').split(',')[0]?.trim() ||
    '000000000000000001';
  const assertion = signAssertion({
    clientId: discordVars.get('DISCORD_TO_IDENTITY_CLIENT_ID') ?? 'v2.discord-gateway',
    kid: discordVars.get('DISCORD_TO_IDENTITY_ACTIVE_KID'),
    privateKeyPem: discordVars.get('DISCORD_TO_IDENTITY_PRIVATE_KEY_PEM'),
    aud: discordVars.get('IDENTITY_ASSERTION_AUD'),
    ttlSeconds: 60,
    extraClaims: { actor_discord_user_id: operatorId },
  });
  results.push(
    await probe('DISCORD_TO_IDENTITY_PROFILE_S2S', `${API_BASE}/identity/v1/internal/profile`, {
      method: 'GET',
      headers: { 'identity-client-assertion': assertion },
    }),
  );
} else {
  console.log('DISCORD_TO_IDENTITY_PROFILE_S2S: SKIP missing env');
}

const allPass = results.every((r) => r.pass);
console.log('\nSUMMARY:', allPass ? 'PASS' : 'FAIL');
process.exitCode = allPass ? 0 : 1;
