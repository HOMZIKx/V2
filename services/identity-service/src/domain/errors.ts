/**
 * Stable V2 identity error codes. These are the only error identifiers that
 * cross the port boundary or reach HTTP clients — raw Better Auth / library
 * errors must be mapped to one of these in the infrastructure adapter.
 */
export const IDENTITY_ERROR_CODES = [
  'UNAUTHENTICATED',
  'ACCOUNT_NOT_LINKED',
  'ACCOUNT_ALREADY_LINKED',
  'CANNOT_UNLINK_LAST',
  'PROVIDER_SUBJECT_TAKEN',
  'VALIDATION_FAILED',
  'AUTH_DISABLED',
  'NOT_FOUND',
  'CLIENT_ASSERTION_INVALID',
  'CLIENT_ASSERTION_REPLAY',
  'INTERNAL_JWT_DISABLED',
  'AUDIENCE_NOT_ALLOWED',
  'LOGIN_NOT_ENTITLED',
  'AUTHORIZATION_UNAVAILABLE',
] as const;

export type IdentityErrorCode = (typeof IDENTITY_ERROR_CODES)[number];

export class IdentityError extends Error {
  public readonly code: IdentityErrorCode;

  public constructor(code: IdentityErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'IdentityError';
    this.code = code;
  }
}

export function isIdentityError(value: unknown): value is IdentityError {
  return value instanceof IdentityError;
}
