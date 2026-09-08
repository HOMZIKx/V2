import { createPrivateKey, randomUUID, sign as signBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = {
  readonly params: Promise<{ readonly path: string[] }>;
};

type IdentityAccount = {
  readonly provider?: string;
  readonly accountId?: string;
};

type ResolvedIdentity = {
  readonly v2UserId: string;
  readonly discordId: string;
};

type InternalJwtConfig = {
  readonly clientId: string;
  readonly privateKeyPem: string;
  readonly kid: string;
  readonly assertionAudience: string;
  readonly targetAudience: string;
};

function normalizeTarget(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/$/, '');
  return trimmed ? trimmed : null;
}

function requiredEnv(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${name} is required for player-team internal JWT`);
  return trimmed;
}

const isProduction = process.env.NODE_ENV === 'production';
const productionBackendOrigin =
  normalizeTarget(process.env.V2_BACKEND_PUBLIC_ORIGIN) ?? 'https://v2-api.zeabur.app';

function identityTarget(): string {
  return (
    normalizeTarget(process.env.IDENTITY_PROXY_TARGET) ??
    (isProduction ? productionBackendOrigin : 'http://127.0.0.1:4200')
  );
}

function playerTeamTarget(): string {
  return (
    normalizeTarget(process.env.PLAYER_TEAM_PROXY_TARGET) ??
    normalizeTarget(process.env.ACTIVITY_PROXY_TARGET) ??
    (isProduction ? productionBackendOrigin : 'http://127.0.0.1:4400')
  );
}

function internalJwtConfig(): InternalJwtConfig | null {
  if (
    process.env.INTERNAL_JWT_CLIENT_ENABLED !== 'true' ||
    process.env.PLAYER_TEAM_INTERNAL_JWT_ENABLED !== 'true'
  ) {
    return null;
  }

  return {
    clientId: requiredEnv(process.env.INTERNAL_JWT_CLIENT_ID, 'INTERNAL_JWT_CLIENT_ID'),
    privateKeyPem: requiredEnv(
      process.env.INTERNAL_JWT_CLIENT_PRIVATE_KEY_PEM,
      'INTERNAL_JWT_CLIENT_PRIVATE_KEY_PEM',
    ).replace(/\\n/g, '\n'),
    kid: requiredEnv(process.env.INTERNAL_JWT_CLIENT_ACTIVE_KID, 'INTERNAL_JWT_CLIENT_ACTIVE_KID'),
    assertionAudience: requiredEnv(
      process.env.INTERNAL_JWT_ASSERTION_AUD,
      'INTERNAL_JWT_ASSERTION_AUD',
    ),
    targetAudience:
      process.env.PLAYER_TEAM_INTERNAL_JWT_AUDIENCE?.trim() ||
      process.env.INTERNAL_JWT_DEFAULT_AUDIENCE?.trim() ||
      'v2.api-gateway',
  };
}

function encodeJwtJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function buildClientAssertion(config: InternalJwtConfig): string {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJwtJson({ alg: 'EdDSA', kid: config.kid });
  const payload = encodeJwtJson({
    jti: randomUUID(),
    iss: config.clientId,
    sub: config.clientId,
    aud: config.assertionAudience,
    iat: now,
    exp: now + 60,
  });
  const signingInput = `${header}.${payload}`;
  const privateKey = createPrivateKey(config.privateKeyPem);
  const signature = signBytes(null, Buffer.from(signingInput), privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

async function issuePlayerTeamToken(cookie: string, config: InternalJwtConfig): Promise<string> {
  const assertion = buildClientAssertion(config);
  const response = await fetch(`${identityTarget()}/identity/internal-token`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie,
      'identity-client-assertion': assertion,
    },
    body: JSON.stringify({ audience: config.targetAudience }),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`identity /internal-token failed: ${response.status}`);
  }
  const body = (await response.json()) as { access_token?: unknown };
  if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
    throw new Error('identity /internal-token returned no access token');
  }
  return body.access_token;
}

async function resolveIdentity(request: NextRequest): Promise<ResolvedIdentity | null> {
  const identityBaseUrl = identityTarget();

  const cookie = request.headers.get('cookie');
  if (!cookie) return null;

  const identityHeaders = new Headers({
    accept: 'application/json',
    cookie,
  });

  const meResponse = await fetch(`${identityBaseUrl}/identity/me`, {
    method: 'GET',
    headers: identityHeaders,
    cache: 'no-store',
  });

  if (meResponse.status === 401) return null;
  if (!meResponse.ok) {
    throw new Error(`identity /me failed: ${meResponse.status}`);
  }
  const meBody = (await meResponse.json()) as { readonly id?: unknown };
  const v2UserId = typeof meBody.id === 'string' ? meBody.id.trim() : '';
  if (!v2UserId) {
    throw new Error('identity /me returned no user id');
  }

  const accountsResponse = await fetch(`${identityBaseUrl}/identity/accounts`, {
    method: 'GET',
    headers: identityHeaders,
    cache: 'no-store',
  });

  if (accountsResponse.status === 401) return null;
  if (!accountsResponse.ok) {
    throw new Error(`identity /accounts failed: ${accountsResponse.status}`);
  }

  const accountsBody = (await accountsResponse.json()) as {
    readonly accounts?: readonly IdentityAccount[];
  };
  const discordId = accountsBody.accounts
    ?.find((account) => account.provider === 'discord')
    ?.accountId?.trim();

  if (!discordId || !/^\d{17,20}$/.test(discordId)) return null;
  return { v2UserId, discordId };
}

function createUpstreamHeaders(
  request: NextRequest,
  identity: ResolvedIdentity,
  accessToken: string | null,
): Headers {
  const headers = new Headers(request.headers);

  // Never trust identity/auth headers supplied by the browser. Identity is
  // resolved server-side above and all security-sensitive headers are replaced.
  headers.delete('host');
  headers.delete('cookie');
  headers.delete('content-length');
  headers.delete('connection');
  headers.delete('authorization');
  headers.delete('x-demo-viewer-id');
  headers.delete('x-authenticated-discord-id');
  headers.delete('x-v2-user-id');
  headers.delete('x-forwarded-for');
  headers.delete('x-forwarded-host');
  headers.delete('x-forwarded-proto');

  // These compatibility identity headers are generated only after server-side
  // Discord session verification, never trusted from the browser.
  headers.set('x-demo-viewer-id', identity.discordId);
  headers.set('x-authenticated-discord-id', identity.discordId);
  headers.set('x-v2-user-id', identity.v2UserId);

  if (accessToken !== null) {
    headers.set('authorization', `Bearer ${accessToken}`);
  }

  return headers;
}

function createClientHeaders(upstream: Response): Headers {
  const headers = new Headers(upstream.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');
  headers.delete('transfer-encoding');
  headers.delete('connection');
  headers.delete('set-cookie');
  return headers;
}

async function proxyPlayerTeam(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const playerTeamBaseUrl = playerTeamTarget();

  let identity: ResolvedIdentity | null;
  try {
    identity = await resolveIdentity(request);
  } catch (error) {
    console.error('player-team proxy: identity lookup failed', error);
    return NextResponse.json(
      { error: 'identity_unavailable', message: 'Unable to verify Discord session' },
      { status: 503 },
    );
  }

  if (!identity) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Valid Discord session required' },
      { status: 401 },
    );
  }

  let accessToken: string | null = null;
  let jwtConfig: InternalJwtConfig | null;
  try {
    jwtConfig = internalJwtConfig();
    if (jwtConfig !== null) {
      const cookie = request.headers.get('cookie');
      if (!cookie) {
        return NextResponse.json(
          { error: 'unauthorized', message: 'Valid Discord session required' },
          { status: 401 },
        );
      }
      accessToken = await issuePlayerTeamToken(cookie, jwtConfig);
    }
  } catch (error) {
    console.error('player-team proxy: internal JWT issue failed', error);
    return NextResponse.json(
      { error: 'identity_token_unavailable', message: 'Unable to authorize Player Team request' },
      { status: 503 },
    );
  }

  const { path } = await context.params;
  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join('/');
  const upstreamUrl = new URL(`${playerTeamBaseUrl}/player-team/${encodedPath}`);
  upstreamUrl.search = request.nextUrl.search;

  const method = request.method.toUpperCase();
  const requestBody = method === 'GET' || method === 'HEAD' ? null : await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method,
      headers: createUpstreamHeaders(request, identity, accessToken),
      ...(requestBody !== null ? { body: requestBody } : {}),
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch (error) {
    console.error('player-team proxy: upstream request failed', error);
    return NextResponse.json(
      { error: 'player_team_unavailable', message: 'Player Team service is unavailable' },
      { status: 503 },
    );
  }

  return new NextResponse(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    headers: createClientHeaders(upstream),
  });
}

export const GET = proxyPlayerTeam;
export const POST = proxyPlayerTeam;
export const PUT = proxyPlayerTeam;
export const PATCH = proxyPlayerTeam;
export const DELETE = proxyPlayerTeam;
export const HEAD = proxyPlayerTeam;
