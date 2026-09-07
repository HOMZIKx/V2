import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCAL_GATEWAY = 'http://127.0.0.1:4100';
const LOCAL_IDENTITY = 'http://127.0.0.1:4200';
const TECHNIKA_SECRET_HEADER = 'x-technika-secret';
const TECHNIKA_ADMIN_DISCORD_ID = '808066932753563668';

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/$/, '');
}

function productionBackendOrigin(): string {
  return trimTrailingSlash(
    process.env.V2_BACKEND_PUBLIC_ORIGIN?.trim() || 'https://v2-api.zeabur.app',
  );
}

function gatewayBaseUrl(): string {
  const configured =
    process.env.DISCORD_GATEWAY_PROXY_TARGET?.trim() ||
    process.env.DISCORD_GATEWAY_BASE_URL?.trim();

  if (configured) return trimTrailingSlash(configured);

  return process.env.NODE_ENV === 'production'
    ? `${productionBackendOrigin()}/discord-gateway`
    : LOCAL_GATEWAY;
}

function identityBaseUrl(): string {
  const configured = process.env.IDENTITY_PROXY_TARGET?.trim();
  if (configured) return trimTrailingSlash(configured);
  return process.env.NODE_ENV === 'production' ? productionBackendOrigin() : LOCAL_IDENTITY;
}

function technikaSecret(): string {
  return (process.env.DISCORD_TECHNIKA_SHARED_SECRET ?? '').trim();
}

type IdentityAccount = {
  readonly provider?: string;
  readonly accountId?: string;
};

type AuthenticatedDiscordSession =
  | { readonly ok: true; readonly discordUserId: string }
  | { readonly ok: false; readonly status: 401 | 503; readonly error: string };

async function resolveAuthenticatedDiscordSession(
  request: Request,
): Promise<AuthenticatedDiscordSession> {
  const cookie = request.headers.get('cookie');
  if (!cookie) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }

  const headers = new Headers({ accept: 'application/json', cookie });
  const baseUrl = identityBaseUrl();

  let meResponse: Response;
  try {
    meResponse = await fetch(`${baseUrl}/identity/me`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });
  } catch {
    return { ok: false, status: 503, error: 'identity_unavailable' };
  }

  if (meResponse.status === 401) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }
  if (!meResponse.ok) {
    return { ok: false, status: 503, error: 'identity_unavailable' };
  }

  let accountsResponse: Response;
  try {
    accountsResponse = await fetch(`${baseUrl}/identity/accounts`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });
  } catch {
    return { ok: false, status: 503, error: 'identity_unavailable' };
  }

  if (accountsResponse.status === 401) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }
  if (!accountsResponse.ok) {
    return { ok: false, status: 503, error: 'identity_unavailable' };
  }

  let accountsBody: { readonly accounts?: readonly IdentityAccount[] };
  try {
    accountsBody = (await accountsResponse.json()) as {
      readonly accounts?: readonly IdentityAccount[];
    };
  } catch {
    return { ok: false, status: 503, error: 'identity_unavailable' };
  }

  const discordUserId = accountsBody.accounts
    ?.find((account) => account.provider === 'discord')
    ?.accountId?.trim();

  if (!discordUserId || !/^\d{17,20}$/.test(discordUserId)) {
    return { ok: false, status: 401, error: 'discord_session_required' };
  }

  return { ok: true, discordUserId };
}

type RouteCtx = { params: Promise<{ path?: string[] }> };

async function handle(request: Request, ctx: RouteCtx): Promise<Response> {
  const { path: segments = [] } = await ctx.params;
  const joined = segments.join('/');

  if (joined === 'meta' || joined === '') {
    return NextResponse.json({
      mutationsEnabled: Boolean(technikaSecret()),
      gateway: gatewayBaseUrl(),
    });
  }

  const allowedExact = new Set([
    'capabilities',
    'config',
    'config/draft',
    'config/validate',
    'config/preview',
    'config/apply',
    'config/rollback',
    'config/test-dm',
    'guilds',
    'panels',
  ]);
  // guilds/{id}… + panels/channels|publish|preview (+ nested guilds panels if added later)
  const allowedPrefix = (path: string) =>
    path === 'guilds' ||
    path.startsWith('guilds/') ||
    path === 'panels' ||
    path.startsWith('panels/') ||
    path === 'member-activity' ||
    path.startsWith('member-activity/');

  if (!allowedExact.has(joined) && !allowedPrefix(joined)) {
    return NextResponse.json({ ok: false, error: 'not_found', path: joined }, { status: 404 });
  }

  const method = request.method.toUpperCase();
  // GET guilds list is public; guild-scoped channels/panels need Technika secret.
  const incomingEarly = new URL(request.url);
  const rankingFull =
    joined === 'member-activity/ranking' &&
    (incomingEarly.searchParams.get('full') === '1' ||
      incomingEarly.searchParams.get('full') === 'true');
  // guilds/{id}/roles requires Technika secret (New Bot LIVE) — do NOT treat as public.
  const publicRead =
    method === 'GET' &&
    !rankingFull &&
    (joined === 'config' ||
      joined === 'capabilities' ||
      joined === 'guilds' ||
      joined === 'member-activity/ranking' ||
      joined === 'member-activity/me' ||
      (joined.startsWith('guilds/') &&
        !joined.includes('/channels') &&
        !joined.includes('/panels') &&
        !joined.includes('/roles')));

  if (!publicRead) {
    const session = await resolveAuthenticatedDiscordSession(request);
    if (!session.ok) {
      return NextResponse.json(
        { ok: false, error: session.error },
        { status: session.status },
      );
    }

    if (session.discordUserId !== TECHNIKA_ADMIN_DISCORD_ID) {
      return NextResponse.json(
        { ok: false, error: 'technik_forbidden' },
        { status: 403 },
      );
    }

    const secret = technikaSecret();
    if (!secret) {
      return NextResponse.json(
        {
          ok: false,
          error: 'technika_not_configured',
          hint: 'Set DISCORD_TECHNIKA_SHARED_SECRET on the web server (not NEXT_PUBLIC_).',
        },
        { status: 503 },
      );
    }
  }

  const url = `${gatewayBaseUrl()}/discord/v1/${joined}${incomingEarly.search}`;
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (!publicRead) {
    headers[TECHNIKA_SECRET_HEADER] = technikaSecret();
  }

  let body: string | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    try {
      body = await request.text();
    } catch {
      body = undefined;
    }
    if (body) {
      headers['content-type'] = request.headers.get('content-type') ?? 'application/json';
    }
  }

  try {
    const init: RequestInit = {
      method,
      headers,
      cache: 'no-store',
    };
    if (body && method !== 'GET' && method !== 'HEAD') {
      init.body = body;
    }
    const upstream = await fetch(url, init);
    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type') ?? 'application/json';
    return new Response(text || JSON.stringify({ ok: false, error: 'empty_upstream' }), {
      status: upstream.status,
      headers: {
        'content-type': contentType.includes('json') ? 'application/json' : contentType,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'gateway_unreachable',
        detail: error instanceof Error ? error.message : 'unknown',
        gateway: gatewayBaseUrl(),
      },
      { status: 502 },
    );
  }
}

export async function GET(request: Request, ctx: RouteCtx): Promise<Response> {
  return handle(request, ctx);
}

export async function PUT(request: Request, ctx: RouteCtx): Promise<Response> {
  return handle(request, ctx);
}

export async function POST(request: Request, ctx: RouteCtx): Promise<Response> {
  return handle(request, ctx);
}

export async function DELETE(request: Request, ctx: RouteCtx): Promise<Response> {
  return handle(request, ctx);
}
