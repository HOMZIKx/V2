import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { importPKCS8, SignJWT } from 'jose';

const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const activityServiceID = '6a8211c2a21454a2cf6ad77b';
const discordServiceID = '6a8211a6bdeaa87e2c52df28';
const API = 'https://v2-api.zeabur.app';

function listVars(serviceID: string): Map<string, string> {
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
  const start = listed.stdout.indexOf('{');
  if (start < 0) throw new Error(`no json for ${serviceID}`);
  const parsed = JSON.parse(listed.stdout.slice(start)) as {
    variables?: Array<{ key: string; value?: string }>;
    readonlyVariables?: Array<{ key: string; value?: string }>;
  };
  const map = new Map<string, string>();
  for (const row of [...(parsed.variables ?? []), ...(parsed.readonlyVariables ?? [])]) {
    map.set(row.key, row.value ?? '');
  }
  return map;
}

async function sign(input: {
  clientId: string;
  kid: string;
  pem: string;
  aud: string;
  ttl: number;
  extra?: Record<string, unknown>;
}): Promise<string> {
  const key = await importPKCS8(input.pem, 'EdDSA');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ jti: randomUUID(), ...(input.extra ?? {}) })
    .setProtectedHeader({ alg: 'EdDSA', kid: input.kid })
    .setIssuer(input.clientId)
    .setSubject(input.clientId)
    .setAudience(input.aud)
    .setIssuedAt(now)
    .setExpirationTime(now + input.ttl)
    .sign(key);
}

function verdict(status: number, body: string): string {
  if (status === 401 || status === 403) {
    if (body.includes('NOT_FOUND') || body.includes('VALIDATION_FAILED')) {
      return 'PASS_S2S';
    }
    return 'FAIL_AUTH';
  }
  if (status === 404 && body.includes('Cannot POST /authorization')) return 'SKIP_PUBLIC';
  if (status >= 400 && status < 500) return 'PASS_S2S';
  if (status >= 200 && status < 300) return 'PASS_OK';
  return 'FAIL_OTHER';
}

const act = listVars(activityServiceID);
const dg = listVars(discordServiceID);
console.log('ACTIVITY_ENABLED=', act.get('ACTIVITY_ENABLED'));
const ttl = Number(act.get('ACTIVITY_CLIENT_ASSERTION_MAX_TTL_SECONDS') ?? 60);
let pass = true;

const idAssert = await sign({
  clientId: act.get('ACTIVITY_TO_IDENTITY_CLIENT_ID') ?? 'v2.activity-service',
  kid: act.get('ACTIVITY_TO_IDENTITY_ACTIVE_KID') ?? '',
  pem: act.get('ACTIVITY_TO_IDENTITY_PRIVATE_KEY_PEM') ?? '',
  aud: act.get('ACTIVITY_IDENTITY_CHARACTER_ASSERTION_AUD') ?? '',
  ttl,
});
const idRes = await fetch(`${API}/identity/v1/internal/character/resolve`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'identity-client-assertion': idAssert },
  body: JSON.stringify({
    discordUserId: '000000000000000001',
    characterId: '00000000-0000-4000-8000-000000000001',
    sessionRoles: ['DPS'],
  }),
});
const idBody = await idRes.text();
const idVerdict = verdict(idRes.status, idBody);
console.log(`ACTIVITY_TO_IDENTITY_S2S: ${idRes.status} ${idVerdict} ${idBody.slice(0, 100)}`);
if (idVerdict === 'FAIL_AUTH' || idVerdict === 'FAIL_OTHER') pass = false;

const azAssert = await sign({
  clientId: act.get('ACTIVITY_TO_AUTHZ_CLIENT_ID') ?? 'v2.activity-service',
  kid: act.get('ACTIVITY_TO_AUTHZ_ACTIVE_KID') ?? '',
  pem: act.get('ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM') ?? '',
  aud: act.get('ACTIVITY_AUTHORIZATION_ASSERTION_AUD') ?? '',
  ttl,
});
const azRes = await fetch(`${API}/authorization/v1/authorize`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'authorization-client-assertion': azAssert },
  body: JSON.stringify({
    subject: { discordUserId: '000000000000000001' },
    permissionId: 'permission.activity.event.read',
    scope: { guildId: '1534228693017432124' },
    operationClass: 'ordinary',
  }),
});
const azBody = await azRes.text();
const azVerdict = verdict(azRes.status, azBody);
console.log(`ACTIVITY_TO_AUTHORIZATION_S2S: ${azRes.status} ${azVerdict} ${azBody.slice(0, 100)}`);
if (azVerdict === 'FAIL_AUTH' || azVerdict === 'FAIL_OTHER') pass = false;
if (azVerdict === 'SKIP_PUBLIC') {
  const keysOk =
    Boolean(act.get('ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM')) &&
    Boolean(act.get('ACTIVITY_AUTHORIZATION_ASSERTION_AUD')) &&
    act.get('ACTIVITY_ENABLED') === 'true';
  console.log(
    `ACTIVITY_TO_AUTHORIZATION_S2S: internal-only path keys=${keysOk ? 'ok' : 'missing'}`,
  );
  if (!keysOk) pass = false;
}

const operatorId =
  (dg.get('DISCORD_TEST_OPERATOR_IDS') ?? '').split(',')[0]?.trim() || '000000000000000001';
const profAssert = await sign({
  clientId: dg.get('DISCORD_TO_IDENTITY_CLIENT_ID') ?? 'v2.discord-gateway',
  kid: dg.get('DISCORD_TO_IDENTITY_ACTIVE_KID') ?? '',
  pem: dg.get('DISCORD_TO_IDENTITY_PRIVATE_KEY_PEM') ?? '',
  aud: dg.get('IDENTITY_ASSERTION_AUD') ?? '',
  ttl: 60,
  extra: { actor_discord_user_id: operatorId },
});
const profRes = await fetch(`${API}/identity/v1/internal/profile`, {
  headers: { 'identity-client-assertion': profAssert },
});
const profBody = await profRes.text();
const profVerdict = verdict(profRes.status, profBody);
console.log(
  `DISCORD_TO_IDENTITY_PROFILE_S2S: ${profRes.status} ${profVerdict} ${profBody.slice(0, 120)}`,
);
if (profVerdict === 'FAIL_AUTH' || profVerdict === 'FAIL_OTHER') pass = false;

console.log('SUMMARY:', pass ? 'PASS' : 'FAIL');
process.exitCode = pass ? 0 : 1;
