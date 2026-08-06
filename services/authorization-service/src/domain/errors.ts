/**
 * Stable V2 authorization error codes. These are the only error identifiers that
 * cross the port boundary or reach HTTP clients — raw library errors must be
 * mapped to one of these in the infrastructure adapter.
 */
export const AUTHORIZATION_ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'VALIDATION_FAILED',
  'AUTH_DISABLED',
  'NOT_FOUND',
  'CONFLICT',
  'CLIENT_ASSERTION_INVALID',
  'CLIENT_ASSERTION_REPLAY',
  'CONFIG_INVALID',
] as const;

export type AuthorizationErrorCode = (typeof AUTHORIZATION_ERROR_CODES)[number];

export class AuthorizationError extends Error {
  public readonly code: AuthorizationErrorCode;

  public constructor(code: AuthorizationErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AuthorizationError';
    this.code = code;
  }
}

export function isAuthorizationError(value: unknown): value is AuthorizationError {
  return value instanceof AuthorizationError;
}
