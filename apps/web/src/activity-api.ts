/**
 * Browser client for activity-service via Next rewrite `/activity/*` → ACTIVITY_PROXY_TARGET.
 * Prefer same-origin paths so cookies/session stay on the web host when Identity is proxied too.
 * OpenAPI: services/activity-service/openapi/activity-v1.yaml
 */

export function getActivityApiBaseUrl(): string {
  const raw =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_ACTIVITY_BASE_URL?.trim()) || '';
  if (raw.length > 0) return raw.replace(/\/$/, '');
  // Same-origin through next.config.mjs rewrite
  return '';
}

export function activityUrl(path: string): string {
  const base = getActivityApiBaseUrl();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const withPrefix = normalized.startsWith('/activity/')
    ? normalized
    : `/activity/v1${normalized}`;
  return `${base}${withPrefix}`;
}

export async function activityFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return fetch(activityUrl(path), {
    ...init,
    credentials: 'include',
    headers,
    cache: 'no-store',
  });
}

/** List activities (member WWW). See OpenAPI GET /activity/v1/activities */
export async function listActivities(query: Record<string, string> = {}): Promise<Response> {
  const qs = new URLSearchParams(query).toString();
  return activityFetch(`/activities${qs ? `?${qs}` : ''}`);
}

/** Current user activities */
export async function listMyActivities(): Promise<Response> {
  return activityFetch('/me/activities');
}

/** Inbox notifications */
export async function listActivityInbox(): Promise<Response> {
  return activityFetch('/inbox');
}

/** RSVP on an activity */
export async function postActivityRsvp(
  activityId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return activityFetch(`/activities/${encodeURIComponent(activityId)}/rsvp`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
