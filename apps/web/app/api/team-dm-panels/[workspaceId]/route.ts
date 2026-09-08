import { NextResponse } from 'next/server';

import { authoritativeNotifyRecipients } from '../../../../src/discord-notify-recipients';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCAL_GATEWAY = 'http://127.0.0.1:4100';
const PRODUCTION_GATEWAY = 'http://discord-gateway.zeabur.internal:4100';

type JsonRecord = Record<string, unknown>;
type VerifiedViewer = { readonly discordId: string; readonly appId: string | null; readonly cookie: string };

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function gatewayBaseUrl(): string {
  const configured = process.env.DISCORD_GATEWAY_PROXY_TARGET?.trim() || process.env.DISCORD_GATEWAY_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  return process.env.NODE_ENV === 'production' ? PRODUCTION_GATEWAY : LOCAL_GATEWAY;
}

function notifySecret(): string {
  return (process.env.DISCORD_NOTIFY_SHARED_SECRET ?? '').trim();
}

async function verifyViewer(request: Request): Promise<VerifiedViewer | Response> {
  const cookie = request.headers.get('cookie')?.trim() ?? '';
  if (!cookie) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  let response: Response;
  try {
    response = await fetch(new URL('/player-team/v1/me/state', request.url), {
      headers: { accept: 'application/json', cookie },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'player_team_unavailable' }, { status: 503 });
  }
  if (!response.ok) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: response.status === 401 ? 401 : 503 });
  const body = (await response.json().catch(() => null)) as { readonly state?: unknown } | null;
  const state = asRecord(body?.state);
  const viewer = asRecord(state?.viewer);
  const discordId = typeof viewer?.discordAccountId === 'string' && /^\d{17,20}$/.test(viewer.discordAccountId.trim())
    ? viewer.discordAccountId.trim()
    : typeof viewer?.id === 'string' && /^\d{17,20}$/.test(viewer.id.trim())
      ? viewer.id.trim()
      : null;
  if (!discordId) return NextResponse.json({ ok: false, error: 'discord_identity_required' }, { status: 401 });
  return {
    discordId,
    appId: typeof viewer?.id === 'string' && viewer.id.trim() ? viewer.id.trim() : null,
    cookie,
  };
}

async function workspaceState(request: Request, cookie: string, workspaceId: string): Promise<JsonRecord | Response> {
  let response: Response;
  try {
    response = await fetch(new URL(`/player-team/v1/workspaces/${encodeURIComponent(workspaceId)}/state`, request.url), {
      headers: { accept: 'application/json', cookie },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'workspace_unavailable' }, { status: 503 });
  }
  if (!response.ok) return NextResponse.json({ ok: false, error: 'workspace_access_denied' }, { status: response.status === 401 || response.status === 404 ? 403 : 503 });
  const body = (await response.json().catch(() => null)) as { readonly state?: unknown } | null;
  const state = asRecord(body?.state);
  if (!state) return NextResponse.json({ ok: false, error: 'invalid_workspace_state' }, { status: 503 });
  return state;
}

function isOwner(workspace: JsonRecord, viewer: VerifiedViewer): boolean {
  const members = Array.isArray(workspace.members) ? workspace.members.map(asRecord).filter((row): row is JsonRecord => row !== null) : [];
  return members.some((member) => {
    if (member.role !== 'owner') return false;
    const discord = typeof member.discordAccountId === 'string' ? member.discordAccountId.trim() : '';
    const id = typeof member.id === 'string' ? member.id.trim() : '';
    return discord === viewer.discordId || id === viewer.discordId || (!!viewer.appId && id === viewer.appId);
  });
}

async function callGateway(path: string, body: unknown): Promise<Response> {
  const secret = notifySecret();
  if (!secret) return NextResponse.json({ ok: false, error: 'notify_not_configured' }, { status: 503 });
  try {
    const upstream = await fetch(`${gatewayBaseUrl()}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-notify-secret': secret },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const text = await upstream.text();
    return new Response(text || '{}', { status: upstream.status, headers: { 'content-type': 'application/json' } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'gateway_unreachable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 502 });
  }
}

export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  const { workspaceId } = await context.params;
  const viewer = await verifyViewer(request);
  if (viewer instanceof Response) return viewer;
  const workspace = await workspaceState(request, viewer.cookie, workspaceId);
  if (workspace instanceof Response) return workspace;
  return callGateway('/notify/daily-timer-panel-config/get', { workspaceId });
}

export async function PUT(request: Request, context: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  const { workspaceId } = await context.params;
  const viewer = await verifyViewer(request);
  if (viewer instanceof Response) return viewer;
  const workspace = await workspaceState(request, viewer.cookie, workspaceId);
  if (workspace instanceof Response) return workspace;
  if (!isOwner(workspace, viewer)) return NextResponse.json({ ok: false, error: 'owner_required' }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { readonly dailyTime?: unknown } | null;
  const dailyTime = typeof body?.dailyTime === 'string' ? body.dailyTime.trim() : '';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dailyTime)) return NextResponse.json({ ok: false, error: 'invalid_daily_time' }, { status: 400 });
  return callGateway('/notify/daily-timer-panel-config', {
    workspaceId,
    dailyTime,
    recipients: authoritativeNotifyRecipients(workspace, 'characterTimers'),
  });
}

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  const { workspaceId } = await context.params;
  const viewer = await verifyViewer(request);
  if (viewer instanceof Response) return viewer;
  const workspace = await workspaceState(request, viewer.cookie, workspaceId);
  if (workspace instanceof Response) return workspace;
  const current = await callGateway('/notify/daily-timer-panel-config/get', { workspaceId });
  const parsed = (await current.clone().json().catch(() => null)) as { readonly config?: { readonly dailyTime?: unknown } | null } | null;
  const dailyTime = typeof parsed?.config?.dailyTime === 'string' ? parsed.config.dailyTime : '08:00';
  return callGateway('/notify/daily-timer-panel-config', {
    workspaceId,
    dailyTime,
    recipients: authoritativeNotifyRecipients(workspace, 'characterTimers'),
  });
}
