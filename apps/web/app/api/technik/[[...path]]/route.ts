import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LOCAL_GATEWAY = 'http://127.0.0.1:4100';
const DEFAULT_PRODUCTION_BACKEND_ORIGIN = 'https://v2-api.zeabur.app';
const TECHNIKA_SECRET_HEADER = 'x-technika-secret';

function cleanBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/$/, '');
  return trimmed ? trimmed : null;
}

function gatewayBaseUrl(): string {
  const explicit =
    cleanBaseUrl(process.env.DISCORD_GATEWAY_BASE_URL) ??
    cleanBaseUrl(process.env.DISCORD_GATEWAY_PROXY_TARGET);
  if (explicit) return explicit;

  if (process.env.NODE_ENV === 'production') {
    const backend =
      cleanBaseUrl(process.env.V2_BACKEND_PUBLIC_ORIGIN) ?? DEFAULT_PRODUCTION_BACKEND_ORIGIN;
    return `${backend}/discord-gateway`;
  }

  return DEFAULT_LOCAL_GATEWAY;
}

function technikaSecret(): string {
  return (process.env.DISCORD_TECHNIKA_SHARED_SECRET ?? '').trim();
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
