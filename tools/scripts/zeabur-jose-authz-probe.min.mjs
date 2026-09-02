import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire('/app/services/activity-service/package.json');
const { importPKCS8, SignJWT } = require('jose');

const aud = process.env.ACTIVITY_AUTHORIZATION_ASSERTION_AUD ?? '';
const clientId = process.env.ACTIVITY_TO_AUTHZ_CLIENT_ID ?? 'v2.activity-service';
const kid = process.env.ACTIVITY_TO_AUTHZ_ACTIVE_KID ?? '';
const pem = (process.env.ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM ?? '').replace(/\\n/g, '\n').trim();
let base = process.env.ACTIVITY_AUTHORIZATION_BASE_URL ?? '';
if (base.endsWith('/')) base = base.slice(0, -1);

try {
  const key = await importPKCS8(pem, 'EdDSA');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ jti: randomUUID() })
    .setProtectedHeader({ alg: 'EdDSA', kid })
    .setIssuer(clientId)
    .setSubject(clientId)
    .setAudience(aud)
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(key);
  const response = await fetch(`${base}/authorization/v1/authorize`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization-client-assertion': assertion,
    },
    body: JSON.stringify({
      subject: { discordUserId: '808066932753563668' },
      permissionId: 'permission.activity.config.manage',
      scope: { type: 'guild', guildId: '1534228693017432124' },
      operationClass: 'sensitive',
    }),
    signal: AbortSignal.timeout(8000),
  });
  const body = await response.text();
  console.log('JOSE_PROBE HTTP', response.status, body.slice(0, 200));
  process.exit(response.ok ? 0 : 1);
} catch (error) {
  console.error('JOSE_PROBE FAIL', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
