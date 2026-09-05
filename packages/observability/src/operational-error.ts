export const OPERATIONAL_ERROR_CATEGORIES = [
  'VALIDATION',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'UPSTREAM_FAILURE',
  'TIMEOUT',
  'RETRY_EXHAUSTED',
  'INTERNAL',
] as const;

export type OperationalErrorCategory = (typeof OPERATIONAL_ERROR_CATEGORIES)[number];

const SHARED_CODE_CATEGORY: Readonly<Record<string, OperationalErrorCategory>> = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  CLIENT_ASSERTION_INVALID: 'UNAUTHENTICATED',
  CLIENT_ASSERTION_REPLAY: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  LOGIN_NOT_ENTITLED: 'FORBIDDEN',
  AUDIENCE_NOT_ALLOWED: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  IDEMPOTENCY_CONFLICT: 'CONFLICT',
  CAPACITY_EXCEEDED: 'CONFLICT',
  CREATE_LIMIT_EXCEEDED: 'CONFLICT',
  PRECONDITION_FAILED: 'CONFLICT',
  ACCOUNT_NOT_LINKED: 'CONFLICT',
  ACCOUNT_ALREADY_LINKED: 'CONFLICT',
  CANNOT_UNLINK_LAST: 'CONFLICT',
  PROVIDER_SUBJECT_TAKEN: 'CONFLICT',
  VALIDATION_FAILED: 'VALIDATION',
  HORIZON_EXCEEDED: 'VALIDATION',
  CONFIGURATION_INVALID: 'VALIDATION',
  CONFIG_INVALID: 'VALIDATION',
  AUTH_DISABLED: 'UPSTREAM_FAILURE',
  DEPENDENCY_UNAVAILABLE: 'UPSTREAM_FAILURE',
  AUTHORIZATION_UNAVAILABLE: 'UPSTREAM_FAILURE',
  DISCORD_GATEWAY_UNAVAILABLE: 'UPSTREAM_FAILURE',
  DISCORD_METADATA_UNAVAILABLE: 'UPSTREAM_FAILURE',
  INTERNAL_JWT_DISABLED: 'UPSTREAM_FAILURE',
  RATE_LIMITED: 'RATE_LIMITED',
};

export function operationalCategoryFromCode(
  code: string | undefined,
  options: { readonly timeout?: boolean; readonly retryExhausted?: boolean } = {},
): OperationalErrorCategory {
  if (options.timeout === true) {
    return 'TIMEOUT';
  }
  if (options.retryExhausted === true) {
    return 'RETRY_EXHAUSTED';
  }
  if (code === undefined || code.length === 0) {
    return 'INTERNAL';
  }
  return SHARED_CODE_CATEGORY[code] ?? 'INTERNAL';
}

/** Classify delivery/outbox last_error text without exposing payload contents. */
export function operationalCategoryFromDeliveryError(
  errorText: string | null | undefined,
): OperationalErrorCategory | null {
  if (errorText === null || errorText === undefined || errorText.trim().length === 0) {
    return null;
  }
  const normalized = errorText.toLowerCase();
  if (normalized.includes('429') || normalized.includes('rate_limited')) {
    return 'RATE_LIMITED';
  }
  if (
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('408')
  ) {
    return 'TIMEOUT';
  }
  if (
    normalized.includes('econnrefused') ||
    normalized.includes('network') ||
    normalized.includes('upstream') ||
    normalized.includes('502') ||
    normalized.includes('503') ||
    normalized.includes('504')
  ) {
    return 'UPSTREAM_FAILURE';
  }
  if (
    normalized.includes('max attempts') ||
    normalized.includes('max delivery attempts') ||
    normalized.includes('retry exhausted')
  ) {
    return 'RETRY_EXHAUSTED';
  }
  if (normalized.includes('401') || normalized.includes('unauthorized')) {
    return 'UNAUTHENTICATED';
  }
  if (normalized.includes('403') || normalized.includes('forbidden')) {
    return 'FORBIDDEN';
  }
  return 'INTERNAL';
}
