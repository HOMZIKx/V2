import { createPrivateKey, randomUUID, sign } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire('/app/services/identity-service/package.json');

function b64u(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signAssertion() {
  const clientId = process.env.IDENTITY_TO_AUTHZ_CLIENT_ID ?? 'v2.identity-service';
  const kid = process.env.IDENTITY_TO_AUTHZ_ACTIVE_KID ?? '';
  const aud = process.env.IDENTITY_AUTHORIZATION_ASSERTION_AUD ?? '';
  const pem = (process.env.IDENTITY_TO_AUTHZ_PRIVATE_KEY_PEM ?? '').replace(/\\n/g, '\n').trim();
  const ttl = Number(process.env.IDENTITY_CLIENT_ASSERTION_MAX_TTL_SECONDS ?? 60);
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

let base = process.env.IDENTITY_AUTHORIZATION_BASE_URL ?? '';
if (base.endsWith('/')) base = base.slice(0, -1);

const assertion = signAssertion();
const response = await fetch(`${base}/authorization/v1/authorize`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'authorization-client-assertion': assertion,
  },
  body: JSON.stringify({
    subject: {
      discordUserId: '000000000000000001',
      v2UserId: '00000000-0000-4000-8000-000000000001',
    },
    permissionId: 'permission.platform.login.www',
    scope: { type: 'organization' },
    operationClass: 'sensitive',
  }),
  signal: AbortSignal.timeout(8000),
});
const body = await response.text();
console.log('IDENTITY_AUTHZ_LOGIN_PROBE HTTP', response.status, body.slice(0, 200));
process.exit(response.ok ? 0 : 1);
