import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCAL_GATEWAY = 'http://127.0.0.1:4100';
const PRODUCTION_GATEWAY = 'http://discord-gateway.zeabur.internal:4100';

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/$/, '');
}

function gatewayBaseUrl(): string {
  const configured =
    process.env.DISCORD_GATEWAY_PROXY_TARGET?.trim() ||
    process.env.DISCORD_GATEWAY_BASE_URL?.trim();
  if (configured) return trimTrailingSlash(configured);
  return process.env.NODE_ENV === 'production' ? PRODUCTION_GATEWAY : LOCAL_GATEWAY;
}

function notifySecret(): string {
  return (process.env.DISCORD_NOTIFY_SHARED_SECRET ?? '').trim();
}

function gatewayPathForAction(action: unknown): string {
  if (action === 'watch') return '/notify/timer-watch';
  if (action === 'reset') return '/notify/timer-reset';
  if (action === 'war-recipients') return '/notify/kingdom-war-recipients';
  return '/notify/timer';
}

/**
 * Server-only forwarder: browser → web → discord-gateway notify endpoints.
 * Secret never exposed as NEXT_PUBLIC_*.
 * Body.action: timer | watch | reset | war-recipients
 */
export async function POST(request: Request): Promise<Response> {
  const secret = notifySecret();
  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error: 'notify_not_configured',
        hint: 'Set DISCORD_NOTIFY_SHARED_SECRET on the web server (not NEXT_PUBLIC_).',
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const action =
    body && typeof body === 'object' && 'action' in body
      ? (body as { action?: unknown }).action
      : 'timer';
  const forwardBody =
    body && typeof body === 'object'
      ? Object.fromEntries(
          Object.entries(body as Record<string, unknown>).filter(([key]) => key !== 'action'),
        )
      : body;

  const url = `${gatewayBaseUrl()}${gatewayPathForAction(action)}`;
  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-notify-secret': secret,
      },
      body: JSON.stringify(forwardBody),
      cache: 'no-store',
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type') ?? 'application/json';
    return new Response(text || JSON.stringify({ ok: false, error: 'empty_upstream' }), {
      status: upstream.status,
      headers: { 'content-type': contentType.includes('json') ? 'application/json' : contentType },
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
