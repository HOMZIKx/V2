import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCAL_GATEWAY = 'http://127.0.0.1:4100';
const PRODUCTION_GATEWAY = 'http://discord-gateway.zeabur.internal:4100';

type JsonRecord = Record<string, unknown>;

type VerifiedViewer = {
  readonly discordId: string;
  readonly cookie: string;
};

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
  if (action === 'team-war-recipients') return '/notify/team-war-recipients';
  return '/notify/timer';
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function discordSnowflake(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^\d{17,20}$/.test(trimmed) ? trimmed : null;
}

function viewerDiscordId(state: unknown): string | null {
  const root = asRecord(state);
  const viewer = asRecord(root?.viewer);
  return discordSnowflake(viewer?.discordAccountId) ?? discordSnowflake(viewer?.id);
}

async function verifyViewer(request: Request): Promise<VerifiedViewer | Response> {
  const cookie = request.headers.get('cookie')?.trim() ?? '';
  if (!cookie) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let response: Response;
  try {
    response = await fetch(new URL('/player-team/v1/me/state', request.url), {
      method: 'GET',
      headers: { accept: 'application/json', cookie },
      cache: 'no-store',
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'player_team_auth_unavailable',
        detail: error instanceof Error ? error.message : 'unknown',
      },
      { status: 503 },
    );
  }

  if (response.status === 401) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!response.ok) {
    return NextResponse.json(
      { ok: false, error: 'player_team_auth_unavailable', status: response.status },
      { status: 503 },
    );
  }

  const body = (await response.json().catch(() => null)) as { readonly state?: unknown } | null;
  const discordId = viewerDiscordId(body?.state);
  if (!discordId) {
    return NextResponse.json({ ok: false, error: 'discord_identity_required' }, { status: 401 });
  }

  return { discordId, cookie };
}

async function authorisedWorkspaceState(
  request: Request,
  cookie: string,
  workspaceId: string,
): Promise<JsonRecord | Response> {
  let response: Response;
  try {
    response = await fetch(
      new URL(`/player-team/v1/workspaces/${encodeURIComponent(workspaceId)}/state`, request.url),
      {
        method: 'GET',
        headers: { accept: 'application/json', cookie },
        cache: 'no-store',
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'workspace_authorization_unavailable',
        detail: error instanceof Error ? error.message : 'unknown',
      },
      { status: 503 },
    );
  }

  if (response.status === 401 || response.status === 404) {
    return NextResponse.json({ ok: false, error: 'workspace_access_denied' }, { status: 403 });
  }
  if (!response.ok) {
    return NextResponse.json(
      { ok: false, error: 'workspace_authorization_unavailable', status: response.status },
      { status: 503 },
    );
  }

  const snapshot = (await response.json().catch(() => null)) as { readonly state?: unknown } | null;
  const state = asRecord(snapshot?.state);
  if (!state) {
    return NextResponse.json({ ok: false, error: 'invalid_workspace_state' }, { status: 503 });
  }
  return state;
}

function notifyRecipients(
  workspace: JsonRecord,
  key: 'characterTimers' | 'kingdomWar',
): string[] {
  const teamPrefs = asRecord(workspace.notifyPrefs);
  const teamDefault = typeof teamPrefs?.[key] === 'boolean' ? Boolean(teamPrefs[key]) : true;
  const members = Array.isArray(workspace.members) ? workspace.members : [];
  const ids = new Set<string>();

  for (const raw of members) {
    const member = asRecord(raw);
    if (!member) continue;
    const personal = asRecord(member.notifyPrefs);
    const enabled = typeof personal?.[key] === 'boolean' ? Boolean(personal[key]) : teamDefault;
    if (!enabled) continue;
    const id = discordSnowflake(member.discordAccountId) ?? discordSnowflake(member.id);
    if (id) ids.add(id);
  }

  return [...ids].slice(0, 40);
}

async function sanitizeForwardBody(
  request: Request,
  action: unknown,
  body: JsonRecord,
  viewer: VerifiedViewer,
): Promise<JsonRecord | Response> {
  const forwardBody = Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'action'));

  // Old global recipient registries are deliberately not exposed to browser callers.
  // Current team flows are workspace-scoped and rebuilt from authoritative membership.
  if (action === 'team-recipients' || action === 'war-recipients') {
    return NextResponse.json(
      { ok: false, error: 'legacy_global_recipient_action_disabled' },
      { status: 403 },
    );
  }

  if (action === 'watch') {
    return { ...forwardBody, discordUserId: viewer.discordId };
  }

  if (action === 'reset') {
    const workspaceId = typeof forwardBody.workspaceId === 'string' ? forwardBody.workspaceId.trim() : '';
    if (!workspaceId) {
      return { ...forwardBody, actorDiscordUserId: viewer.discordId };
    }
    const workspace = await authorisedWorkspaceState(request, viewer.cookie, workspaceId);
    if (workspace instanceof Response) return workspace;
    return {
      ...forwardBody,
      actorDiscordUserId: viewer.discordId,
      // A character timer must keep its owner in the authoritative recipient set.
      // Discord Gateway schedules the completion DM only for recipientDiscordUserIds;
      // filtering the actor here silently removed the owner's own reminder.
      recipientDiscordUserIds: notifyRecipients(workspace, 'characterTimers'),
    };
  }

  if (action === 'team-war-recipients') {
    const workspaceId = typeof forwardBody.workspaceId === 'string' ? forwardBody.workspaceId.trim() : '';
    if (!workspaceId) {
      return NextResponse.json({ ok: false, error: 'workspace_id_required' }, { status: 400 });
    }
    const workspace = await authorisedWorkspaceState(request, viewer.cookie, workspaceId);
    if (workspace instanceof Response) return workspace;
    return {
      ...forwardBody,
      workspaceId,
      recipients: notifyRecipients(workspace, 'kingdomWar'),
    };
  }

  if (action === 'timer' || action === undefined || action === null) {
    return { ...forwardBody, discordUserId: viewer.discordId };
  }

  return NextResponse.json({ ok: false, error: 'unsupported_notify_action' }, { status: 400 });
}

/**
 * Authenticated server-only forwarder: browser → web → discord-gateway.
 * The shared secret never reaches the browser. Team fan-out is derived from the
 * authoritative shared workspace instead of trusting recipient IDs from a client payload.
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

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const body = asRecord(rawBody);
  if (!body) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  }

  const viewer = await verifyViewer(request);
  if (viewer instanceof Response) return viewer;

  const action = body.action;
  const forwardBody = await sanitizeForwardBody(request, action, body, viewer);
  if (forwardBody instanceof Response) return forwardBody;

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
