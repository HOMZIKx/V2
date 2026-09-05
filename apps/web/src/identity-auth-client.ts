/**
 * Browser client for V2 Identity (Better Auth Discord) ↔ DESTILED web.
 *
 * OAuth start uses top-level navigation to Identity
 * `GET /identity/web-oauth/discord` (never fetch→redirect alone — that risks
 * `state_mismatch`). After Discord, Identity `/identity/web-bridge` reads
 * `/identity/me` same-origin and sends the viewer to web `/auth/callback`.
 */

import type { PlayerIdentity } from './player-store';
import { initialsFromDisplayName } from './player-store';

const DEFAULT_IDENTITY_BASE = 'http://127.0.0.1:4200';

export interface IdentityUserView {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  readonly emailSynthetic: boolean;
  readonly emailVerified: boolean;
  readonly image: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LinkedAccountView {
  readonly id: string;
  readonly provider: string;
  readonly accountId: string;
  readonly scopes: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ResolvedIdentityViewer {
  readonly viewer: PlayerIdentity;
  readonly v2UserId: string;
  readonly discordAccountId: string | null;
}

export function getIdentityAuthBaseUrl(): string {
  const raw =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_IDENTITY_AUTH_BASE_URL) ||
    DEFAULT_IDENTITY_BASE;
  const trimmed = String(raw).trim().replace(/\/$/, '');
  return trimmed.length > 0 ? trimmed : DEFAULT_IDENTITY_BASE;
}

/** Fake Mateusz / state simulator — only when explicitly enabled. */
export function isDiscordAuthSimulateEnabled(): boolean {
  if (typeof process === 'undefined') return false;
  return process.env.NEXT_PUBLIC_DISCORD_AUTH_SIMULATE === 'true';
}

/** When false, web skips real OAuth (simulator-only / offline). Default: enabled. */
export function isIdentityAuthClientEnabled(): boolean {
  if (typeof process === 'undefined') return true;
  return process.env.NEXT_PUBLIC_IDENTITY_AUTH_ENABLED !== 'false';
}

/**
 * Map Identity session → PlayerIdentity.
 * Viewer `id` is the Discord snowflake when linked (DESTILED invites / team
 * headers); otherwise falls back to V2 user UUID.
 */
export function toPlayerIdentityFromSession(input: {
  readonly displayName: string;
  readonly v2UserId: string;
  readonly discordAccountId?: string | null;
}): PlayerIdentity {
  const displayName = input.displayName.trim() || 'Discord';
  const v2UserId = input.v2UserId.trim();
  const discordAccountId = input.discordAccountId?.trim() || null;
  const id = discordAccountId || v2UserId || 'unknown';
  return {
    id,
    displayName,
    discordDisplayName: displayName,
    initials: initialsFromDisplayName(displayName),
    ...(discordAccountId ? { discordAccountId } : {}),
  };
}

async function identityFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = getIdentityAuthBaseUrl();
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return fetch(`${base}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
}

export async function probeIdentityLive(): Promise<boolean> {
  try {
    const res = await fetch(`${getIdentityAuthBaseUrl()}/health/live`, {
      method: 'GET',
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchIdentityMe(): Promise<IdentityUserView | null> {
  const res = await identityFetch('/identity/me', { method: 'GET', cache: 'no-store' });
  if (res.status === 401) return null;
  if (!res.ok) {
    throw new Error(`identity_me_${res.status}`);
  }
  return (await res.json()) as IdentityUserView;
}

export async function fetchIdentityAccounts(): Promise<readonly LinkedAccountView[]> {
  const res = await identityFetch('/identity/accounts', { method: 'GET', cache: 'no-store' });
  if (res.status === 401) return [];
  if (!res.ok) {
    throw new Error(`identity_accounts_${res.status}`);
  }
  const body = (await res.json()) as { accounts?: LinkedAccountView[] };
  return body.accounts ?? [];
}

export async function resolveDiscordViewerFromSession(): Promise<ResolvedIdentityViewer | null> {
  if (!isIdentityAuthClientEnabled()) return null;
  const me = await fetchIdentityMe();
  if (!me) return null;
  let discordAccountId: string | null = null;
  try {
    const accounts = await fetchIdentityAccounts();
    discordAccountId = accounts.find((account) => account.provider === 'discord')?.accountId ?? null;
  } catch {
    // me succeeded; accounts optional
  }
  return {
    v2UserId: me.id,
    discordAccountId,
    viewer: toPlayerIdentityFromSession({
      displayName: me.name,
      v2UserId: me.id,
      discordAccountId,
    }),
  };
}

/**
 * Top-level navigate to Identity Discord OAuth start (sets state cookie on :4200).
 * returnTo → Identity web-bridge → web `/auth/callback` with viewer query.
 */
export function startDiscordOAuthRedirect(
  webOrigin: string =
    typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3000',
): void {
  const identityBase = getIdentityAuthBaseUrl();
  const bridgeReturnTo = `${identityBase}/identity/web-bridge?to=${encodeURIComponent(webOrigin)}`;
  const startUrl = `${identityBase}/identity/web-oauth/discord?returnTo=${encodeURIComponent(bridgeReturnTo)}`;
  window.location.assign(startUrl);
}

/** @deprecated alias — prefer startDiscordOAuthRedirect */
export function beginDiscordSignInRedirect(
  callbackURL: string =
    typeof window !== 'undefined' ? `${window.location.origin}/` : 'http://127.0.0.1:3000/',
): void {
  let origin = 'http://127.0.0.1:3000';
  try {
    origin = new URL(callbackURL).origin;
  } catch {
    // keep default
  }
  startDiscordOAuthRedirect(origin);
}

export function viewerFromCallbackSearchParams(params: URLSearchParams): PlayerIdentity | null {
  const viewerId = params.get('viewerId')?.trim();
  const displayName = params.get('displayName')?.trim();
  if (!viewerId || !displayName) return null;
  const discordAccountId = params.get('discordAccountId')?.trim() || null;
  // Bridge sends V2 uuid as viewerId + optional discordAccountId.
  return toPlayerIdentityFromSession({
    displayName,
    v2UserId: viewerId,
    discordAccountId,
  });
}
