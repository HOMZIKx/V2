const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

/**
 * Browser-supplied X-Actor-* must never be forwarded in production.
 * DEV may opt in with API_GATEWAY_FORWARD_ACTOR_HEADERS=true.
 */
export function resolveForwardActorHeaders(env: NodeJS.ProcessEnv = process.env): boolean {
  if ((env.NODE_ENV ?? '').trim() === 'production') {
    return false;
  }
  const value = env.API_GATEWAY_FORWARD_ACTOR_HEADERS;
  if (value === undefined || value.trim() === '') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_VALUES.has(normalized)) {
    return false;
  }
  return false;
}
