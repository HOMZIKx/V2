/**
 * Run inside activity-service container (Zeabur exec) — probes internal Authorization S2S.
 * Never prints private keys or assertion tokens.
 */
import { importPKCS8, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';

const baseUrl = process.env.ACTIVITY_AUTHORIZATION_BASE_URL?.replace(/\/$/, '');
const aud = process.env.ACTIVITY_AUTHORIZATION_ASSERTION_AUD?.trim();
const clientId = process.env.ACTIVITY_TO_AUTHZ_CLIENT_ID?.trim() ?? 'v2.activity-service';
const kid = process.env.ACTIVITY_TO_AUTHZ_ACTIVE_KID?.trim();
const pem = process.env.ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM?.replace(/\\n/g, '\n').trim();
const ttl = Number(process.env.ACTIVITY_CLIENT_ASSERTION_MAX_TTL_SECONDS ?? 60);

if (!baseUrl || !aud || !kid || !pem?.includes('BEGIN PRIVATE KEY')) {
  console.error('missing authz env');
  process.exit(1);
}

const key = await importPKCS8(pem, 'EdDSA');
const now = Math.floor(Date.now() / 1000);
const assertion = await new SignJWT({ jti: randomUUID() })
  .setProtectedHeader({ alg: 'EdDSA', kid })
  .setIssuer(clientId)
  .setSubject(clientId)
  .setAudience(aud)
  .setIssuedAt(now)
  .setExpirationTime(now + ttl)
  .sign(key);

const url = `${baseUrl}/authorization/v1/authorize`;
const response = await fetch(url, {
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
console.log(`INTERNAL_AUTHZ_PROBE: HTTP ${response.status} body=${body.slice(0, 200)}`);
process.exitCode = response.ok ? 0 : 1;
