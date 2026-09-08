import { createPublicKey, verify as verifySignature } from 'node:crypto';

import { PlayerTeamError } from '../domain/errors.js';
import { type PlayerTeamEnv } from '../infrastructure/config/player-team-env.js';

type RequestHeaders = Record<string, string | string[] | undefined>;
type JwtRecord = Record<string, unknown>;
type PublicJwkInput = {
  readonly kty?: string;
  readonly crv?: string;
  readonly x?: string;
};

const DISCORD_ID_RE = /^\d{17,20}$/;
const JWT_MAX_TTL_SECONDS = 300;
const JWT_CLOCK_TOLERANCE_SECONDS = 60;
const JWKS_CACHE_MS = 60_000;

let cachedJwks: {
  readonly url: string;
  readonly expiresAt: number;
  readonly keys: JwtRecord[];
} | null = null;

function firstHeader(headers: RequestHeaders, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function decodeJwtPart(encoded: string): JwtRecord {
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed as JwtRecord;
  } catch {
    throw new PlayerTeamError('UNAUTHORIZED', 'invalid internal JWT');
  }
}

async function loadJwks(url: string): Promise<JwtRecord[]> {
  const now = Date.now();
  if (cachedJwks !== null && cachedJwks.url === url && cachedJwks.expiresAt > now) {
    return cachedJwks.keys;
  }

  let response: Response;
  try {
    response = await fetch(url, { method: 'GET', cache: 'no-store' });
  } catch {
    throw new PlayerTeamError('UNAUTHORIZED', 'identity JWKS is unavailable');
  }
  if (!response.ok) {
    throw new PlayerTeamError('UNAUTHORIZED', 'identity JWKS is unavailable');
  }

  const raw = (await response.json()) as unknown;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PlayerTeamError('UNAUTHORIZED', 'identity JWKS response is invalid');
  }
  const keysRaw = (raw as { keys?: unknown }).keys;
  if (!Array.isArray(keysRaw)) {
    throw new PlayerTeamError('UNAUTHORIZED', 'identity JWKS response is invalid');
  }
  const keys = keysRaw.filter(
    (key): key is JwtRecord => key !== null && typeof key === 'object' && !Array.isArray(key),
  );
  cachedJwks = { url, expiresAt: now + JWKS_CACHE_MS, keys };
  return keys;
}

async function verifyIdentityInternalJwt(token: string, env: PlayerTeamEnv): Promise<void> {
  const segments = token.split('.');
  if (segments.length !== 3) {
    throw new PlayerTeamError('UNAUTHORIZED', 'invalid internal JWT');
  }
  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new PlayerTeamError('UNAUTHORIZED', 'invalid internal JWT');
  }

  const header = decodeJwtPart(encodedHeader);
  const payload = decodeJwtPart(encodedPayload);
  const kid = typeof header.kid === 'string' ? header.kid : '';
  if (header.alg !== 'EdDSA' || kid.length === 0) {
    throw new PlayerTeamError('UNAUTHORIZED', 'invalid internal JWT header');
  }

  const jwksUrl = env.PLAYER_TEAM_INTERNAL_JWT_JWKS_URL;
  const issuer = env.PLAYER_TEAM_INTERNAL_JWT_ISSUER;
  if (jwksUrl === undefined || issuer === undefined) {
    throw new PlayerTeamError('UNAUTHORIZED', 'internal JWT verification is not configured');
  }

  const keys = await loadJwks(jwksUrl);
  const jwk = keys.find((candidate) => candidate.kid === kid);
  if (jwk === undefined) {
    throw new PlayerTeamError('UNAUTHORIZED', 'internal JWT signing key is unknown');
  }

  let signatureValid = false;
  try {
    const publicKey = createPublicKey({ key: jwk as PublicJwkInput, format: 'jwk' });
    signatureValid = verifySignature(
      null,
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      publicKey,
      Buffer.from(encodedSignature, 'base64url'),
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    throw new PlayerTeamError('UNAUTHORIZED', 'internal JWT signature is invalid');
  }

  if (payload.iss !== issuer || payload.aud !== env.PLAYER_TEAM_INTERNAL_JWT_AUDIENCE) {
    throw new PlayerTeamError('UNAUTHORIZED', 'internal JWT issuer or audience is invalid');
  }
  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  const iat = payload.iat;
  const exp = payload.exp;
  if (
    sub.length === 0 ||
    typeof iat !== 'number' ||
    !Number.isInteger(iat) ||
    typeof exp !== 'number' ||
    !Number.isInteger(exp) ||
    exp <= iat ||
    exp - iat > JWT_MAX_TTL_SECONDS
  ) {
    throw new PlayerTeamError('UNAUTHORIZED', 'internal JWT claims are invalid');
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    iat > nowSeconds + JWT_CLOCK_TOLERANCE_SECONDS ||
    exp < nowSeconds - JWT_CLOCK_TOLERANCE_SECONDS
  ) {
    throw new PlayerTeamError('UNAUTHORIZED', 'internal JWT is expired or not yet valid');
  }
}

/**
 * Resolve the Discord identity used by player-team endpoints.
 * In production/internal-JWT mode no demo flag is required: the bearer token is
 * cryptographically verified first and only then the server-injected Discord
 * identity header is trusted.
 */
export async function resolvePlayerTeamRequestDiscordId(input: {
  readonly headers: RequestHeaders;
  readonly env: PlayerTeamEnv;
  readonly assertDemoAccess: (demoViewerId: string | undefined) => string;
}): Promise<string> {
  if (!input.env.PLAYER_TEAM_INTERNAL_JWT_ENABLED) {
    return input.assertDemoAccess(
      firstHeader(input.headers, input.env.PLAYER_TEAM_DEMO_VIEWER_HEADER),
    );
  }

  const authorization = firstHeader(input.headers, 'authorization')?.trim();
  if (!authorization?.startsWith('Bearer ')) {
    throw new PlayerTeamError('UNAUTHORIZED', 'missing internal bearer token');
  }
  const token = authorization.slice('Bearer '.length).trim();
  if (!token) {
    throw new PlayerTeamError('UNAUTHORIZED', 'missing internal bearer token');
  }

  await verifyIdentityInternalJwt(token, input.env);

  const discordId = firstHeader(
    input.headers,
    input.env.PLAYER_TEAM_AUTHENTICATED_DISCORD_HEADER,
  )?.trim();
  if (!discordId || !DISCORD_ID_RE.test(discordId)) {
    throw new PlayerTeamError('UNAUTHORIZED', 'missing authenticated Discord identity');
  }
  return discordId;
}
