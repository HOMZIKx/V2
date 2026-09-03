import { createPrivateKey, randomUUID, sign } from 'node:crypto';

function b64u(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

let base = process.env.ACTIVITY_AUTHORIZATION_BASE_URL ?? '';
if (base.endsWith('/')) base = base.slice(0, -1);
const aud = process.env.ACTIVITY_AUTHORIZATION_ASSERTION_AUD?.trim() ?? '';
const clientId = process.env.ACTIVITY_TO_AUTHZ_CLIENT_ID ?? 'v2.activity-service';
const kid = process.env.ACTIVITY_TO_AUTHZ_ACTIVE_KID?.trim() ?? '';
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
const assertion = `${signingInput}.${b64u(sign(null, Buffer.from(signingInput), key))}`;

const response = await fetch(`${base}/authorization/v1/authorize`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'authorization-client-assertion': assertion,
  },
  body: JSON.stringify({
    subject: { discordUserId: '000000000000000001' },
    permissionId: 'permission.activity.config.manage',
    scope: { type: 'guild', guildId: '1534228693017432124' },
    operationClass: 'sensitive',
  }),
  signal: AbortSignal.timeout(8_000),
});
const body = await response.text();
console.log(`INTERNAL_AUTHZ_PROBE HTTP ${response.status} ${body.slice(0, 300)}`);
process.exit(response.ok ? 0 : 1);
