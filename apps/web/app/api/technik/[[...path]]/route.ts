import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_GATEWAY = 'http://127.0.0.1:4100';
const TECHNIKA_SECRET_HEADER = 'x-technika-secret';

function gatewayBaseUrl(): string {
  const raw =
    (process.env.DISCORD_GATEWAY_BASE_URL ?? process.env.DISCORD_GATEWAY_PROXY_TARGET ?? '').trim() ||
    DEFAULT_GATEWAY;
  return raw.replace(/\/$/, '');
}

function technikaSecret(): string {
  return (process.env.DISCORD_TECHNIKA_SHARED_SECRET ?? '').trim();
}

type RouteCtx = { params: Promise<{ path?: string[] }> };

const MUTATING = new Set(['PUT', 'POST', 'PATCH', 'DELETE']);

async function handle(request: Request, ctx: RouteCtx): Promise<Response> {
  const { path: segments = [] } = await ctx.params;
  const joined = segments.join('/');

  if (joined === 'meta' || joined === '') {
    return NextResponse.json({
      mutationsEnabled: Boolean(technikaSecret()),
      gateway: gatewayBaseUrl(),
    });
  }

  const allowed = new Set([
    'capabilities',
    'config',
    'config/draft',
    'config/validate',
    'config/preview',
    'config/apply',
    'config/rollback',
  ]);

  if (!allowed.has(joined)) {
    return NextResponse.json({ ok: false, error: 'not_found', path: joined }, { status: 404 });
  }

  const method = request.method.toUpperCase();
  const publicRead = method === 'GET' && (joined === 'config' || joined === 'capabilities');

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

  const url = `${gatewayBaseUrl()}/discord/v1/${joined}`;
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
    const upstream = await fetch(url, {
      method,
      headers,
      body: body && method !== 'GET' ? body : undefined,
      cache: 'no-store',
    });
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