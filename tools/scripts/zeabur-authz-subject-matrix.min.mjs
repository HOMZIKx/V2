import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire('/app/services/activity-service/package.json');
const { importPKCS8, SignJWT } = require('jose');

const pem = (process.env.ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM ?? '').replace(/\\n/g, '\n').trim();
const kid = process.env.ACTIVITY_TO_AUTHZ_ACTIVE_KID ?? '';
const aud = process.env.ACTIVITY_AUTHORIZATION_ASSERTION_AUD ?? '';
const clientId = process.env.ACTIVITY_TO_AUTHZ_CLIENT_ID ?? 'v2.activity-service';
let base = process.env.ACTIVITY_AUTHORIZATION_BASE_URL ?? '';
if (base.endsWith('/')) base = base.slice(0, -1);

async function probe(label, subject) {
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
      subject,
      permissionId: 'permission.activity.config.manage',
      scope: { type: 'guild', guildId: '1534228693017432124' },
      operationClass: 'sensitive',
    }),
    signal: AbortSignal.timeout(8000),
  });
  const body = await response.text();
  console.log(label, response.status, body.slice(0, 120));
}

await probe('discord_only', { discordUserId: '808066932753563668' });
await probe('discord_plus_bad_v2', {
  discordUserId: '808066932753563668',
  v2UserId: '00000000-0000-4000-8000-000000000001',
});
