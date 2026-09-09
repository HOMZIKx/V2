import { NextResponse } from 'next/server';

import {
  canProbeOwnDiscordMembership,
  parseTechnikMembershipProbePath,
} from '../../../../src/technik-membership-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCAL_GATEWAY = 'http://127.0.0.1:4100';
const PRODUCTION_GATEWAY = 'http://discord-gateway.zeabur.internal:4100';
const LOCAL_IDENTITY = 'http://127.0.0.1:4200';
const TECHNIKA_SECRET_HEADER = 'x-technika-secret';

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

  return process.env.NODE_ENV === 'production' ? PRODUCTION_GATEWAY : LOCAL_GATEWAY;
}

function identityBaseUrl(): string {
  const configured = process.env.IDENTITY_PROXY_TARGET?.trim();
  if (configured) return trimTrailingSlash(configured);
  return process.env.NODE_ENV === 'production' ? productionBackendOrigin() : LOCAL_IDENTITY;
}

function technikaSecret(): string {
  return (process.env.DISCORD_TECHNIKA_SHARED_SECRET ?? '').trim();
}

function technikaAdminDiscordIds(): ReadonlySet<string> {
  const configured = process.env.TECHNIKA_ADMIN_DISCORD_IDS?.trim() ?? '';
  return new Set(
    configured
      .split(',')
      .map((value) => value.trim())
      .filter((value) => /^\d{17,20}$/.test(value)),
  );
}

function isTechnikaAdmin(discordUserId: string): boolean {
  return technikaAdminDiscordIds().has(discordUserId.trim());
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

async function requireTechnikaAdmin(request: Request): Promise<
  | { readonly ok: true; readonly discordUserId: string }
  | { readonly ok: false; readonly response: Response }
> {
  const session = await resolveAuthenticatedDiscordSession(request);
  if (!session.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: session.error },
        { status: session.status },
      ),
    };
  }

  if (!isTechnikaAdmin(session.discordUserId)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'technik_forbidden' }, { status: 403 }),
    };
  }

  return { ok: true, discordUserId: session.discordUserId };
}

type RouteCtx = { params: Promise<{ path?: string[] }> };

async function handle(request: Request, ctx: RouteCtx): Promise<Response> {
  const { path: segments = [] } = await ctx.params;
  const joined = segments.join('/');

  if (joined === 'access') {
    const session = await resolveAuthenticatedDiscordSession(request);
    if (!session.ok) {
      return NextResponse.json(
        { ok: false, allowed: false, error: session.error },
        { status: session.status },
      );
    }
    return NextResponse.json({ ok: true, allowed: isTechnikaAdmin(session.discordUserId) });
  }

  if (joined === 'meta' || joined === '') {
    const access = await requireTechnikaAdmin(request);
    if (!access.ok) return access.response;
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
  const incomingEarly = new URL(request.url);
  const rankingFull =
    joined === 'member-activity/ranking' &&
    (incomingEarly.searchParams.get('full') === '1' ||
      incomingEarly.searchParams.get('full') === 'true');
  const membershipTarget = parseTechnikMembershipProbePath(joined);
  const selfMembershipRead = method === 'GET' && membershipTarget !== null;
  const publicRead =
    method === 'GET' &&
    !rankingFull &&
    !selfMembershipRead &&
    (joined === 'config' ||
      joined === 'capabilities' ||
      joined === 'guilds' ||
      joined === 'member-activity/ranking' ||
      joined === 'member-activity/me' ||
      (joined.startsWith('guilds/') &&
        !joined.includes('/channels') &&
        !joined.includes('/panels') &&
        !joined.includes('/roles') &&
        !joined.includes('/members/')));

  if (selfMembershipRead) {
    const session = await resolveAuthenticatedDiscordSession(request);
    if (!session.ok) {
      return NextResponse.json(
        { ok: false, error: session.error },
        { status: session.status },
      );
    }

    if (!canProbeOwnDiscordMembership(joined, session.discordUserId)) {
      return NextResponse.json(
        { ok: false, error: 'membership_probe_forbidden' },
        { status: 403 },
      );
    }

    if (!technikaSecret()) {
      return NextResponse.json(
        { ok: false, error: 'technika_not_configured' },
        { status: 503 },
      );
    }
  } else if (!publicRead) {
    const access = await requireTechnikaAdmin(request);
    if (!access.ok) return access.response;

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
