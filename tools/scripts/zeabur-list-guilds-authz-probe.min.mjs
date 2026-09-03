import { createPrivateKey, randomUUID, sign } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire('/app/services/activity-service/package.json');

function b64u(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signAssertion() {
  const clientId = process.env.ACTIVITY_TO_AUTHZ_CLIENT_ID ?? 'v2.activity-service';
  const kid = process.env.ACTIVITY_TO_AUTHZ_ACTIVE_KID ?? '';
  const aud = process.env.ACTIVITY_AUTHORIZATION_ASSERTION_AUD ?? '';
  const pem = (process.env.ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM ?? '').replace(/\\n/g, '\n').trim();
  const ttl = Number(process.env.ACTIVITY_CLIENT_ASSERTION_MAX_TTL_SECONDS ?? 60);
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ alg: 'EdDSA', kid, typ: 'JWT' }));
  const payload = b64u(
    JSON.stringify({
      jti: randomUUID(),
      iss: clientId,
      sub: clientId,
      aud,
      iat: now,
      exp: now + ttl,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const key = createPrivateKey(pem);
  return `${signingInput}.${b64u(sign(null, Buffer.from(signingInput), key))}`;
}

let base = process.env.ACTIVITY_DISCORD_GATEWAY_BASE_URL ?? '';
if (base.endsWith('/')) base = base.slice(0, -1);

const guildRes = await fetch(`${base}/internal/v1/discord/guilds`, {
  headers: { 'content-type': 'application/json' },
  signal: AbortSignal.timeout(8000),
});
const guildBody = await guildRes.text();
console.log('GUILDS HTTP', guildRes.status, guildBody.slice(0, 300));

let authBase = process.env.ACTIVITY_AUTHORIZATION_BASE_URL ?? '';
if (authBase.endsWith('/')) authBase = authBase.slice(0, -1);
const assertion = signAssertion();

let guilds = [];
try {
  guilds = JSON.parse(guildBody).guilds ?? [];
} catch {
  guilds = [];
}

for (const guild of guilds.slice(0, 5)) {
  const response = await fetch(`${authBase}/authorization/v1/authorize`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization-client-assertion': assertion,
    },
    body: JSON.stringify({
      subject: { discordUserId: '808066932753563668' },
      permissionId: 'permission.activity.config.manage',
      scope: { type: 'guild', guildId: guild.id },
      operationClass: 'sensitive',
    }),
    signal: AbortSignal.timeout(8000),
  });
  const body = await response.text();
  console.log('AUTHZ', guild.id, response.status, body.slice(0, 120));
}
process.exit(0);
