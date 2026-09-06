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

function normalizeTarget(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/$/, '');
  return trimmed ? trimmed : null;
}

async function resolveDiscordViewerId(request: NextRequest): Promise<string | null> {
  const identityTarget = normalizeTarget(process.env.IDENTITY_PROXY_TARGET);
  if (!identityTarget) {
    throw new Error('IDENTITY_PROXY_TARGET is not configured');
  }

  const cookie = request.headers.get('cookie');
  if (!cookie) return null;

  const identityHeaders = new Headers({
    accept: 'application/json',
    cookie,
  });

  const meResponse = await fetch(`${identityTarget}/identity/me`, {
    method: 'GET',
    headers: identityHeaders,
    cache: 'no-store',
  });

  if (meResponse.status === 401) return null;
  if (!meResponse.ok) {
    throw new Error(`identity /me failed: ${meResponse.status}`);
  }

  const accountsResponse = await fetch(`${identityTarget}/identity/accounts`, {
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

  return discordId && /^\d{17,20}$/.test(discordId) ? discordId : null;
}

function createUpstreamHeaders(request: NextRequest, viewerId: string): Headers {
  const headers = new Headers(request.headers);

  // Never trust identity/auth headers supplied by the browser. The viewer id is
  // derived from the real Identity session above and injected here server-side.
  headers.delete('host');
  headers.delete('cookie');
  headers.delete('content-length');
  headers.delete('connection');
  headers.delete('authorization');
  headers.delete('x-demo-viewer-id');
  headers.delete('x-forwarded-for');
  headers.delete('x-forwarded-host');
  headers.delete('x-forwarded-proto');
  headers.set('x-demo-viewer-id', viewerId);

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
  const playerTeamTarget = normalizeTarget(process.env.PLAYER_TEAM_PROXY_TARGET);
  if (!playerTeamTarget) {
    return NextResponse.json(
      { error: 'player_team_unavailable', message: 'PLAYER_TEAM_PROXY_TARGET is not configured' },
      { status: 503 },
    );
  }

  let viewerId: string | null;
  try {
    viewerId = await resolveDiscordViewerId(request);
  } catch (error) {
    console.error('player-team proxy: identity lookup failed', error);
    return NextResponse.json(
      { error: 'identity_unavailable', message: 'Unable to verify Discord session' },
      { status: 503 },
    );
  }

  if (!viewerId) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Valid Discord session required' },
      { status: 401 },
    );
  }

  const { path } = await context.params;
  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join('/');
  const upstreamUrl = new URL(`${playerTeamTarget}/player-team/${encodedPath}`);
  upstreamUrl.search = request.nextUrl.search;

  const method = request.method.toUpperCase();
  const requestBody = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method,
      headers: createUpstreamHeaders(request, viewerId),
      body: requestBody,
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
