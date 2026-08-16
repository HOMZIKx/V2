export const ACTIVITY_ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'GONE',
  'PRECONDITION_FAILED',
  'CAPACITY_EXCEEDED',
  'CREATE_LIMIT_EXCEEDED',
  'HORIZON_EXCEEDED',
  'IDEMPOTENCY_CONFLICT',
  'CLIENT_ASSERTION_INVALID',
  'CLIENT_ASSERTION_REPLAY',
  'CONFIG_INVALID',
  'AUTH_DISABLED',
] as const;

export type ActivityErrorCode = (typeof ACTIVITY_ERROR_CODES)[number];

export class ActivityError extends Error {
  public readonly code: ActivityErrorCode;

  public constructor(code: ActivityErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ActivityError';
    this.code = code;
  }
}

export function isActivityError(value: unknown): value is ActivityError {
  return value instanceof ActivityError;
}
