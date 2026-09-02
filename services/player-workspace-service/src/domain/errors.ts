export const PLAYER_WORKSPACE_ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'CLIENT_ASSERTION_INVALID',
  'CLIENT_ASSERTION_REPLAY',
  'CONFIG_INVALID',
  'DEPENDENCY_UNAVAILABLE',
] as const;

export type PlayerWorkspaceErrorCode = (typeof PLAYER_WORKSPACE_ERROR_CODES)[number];

export class PlayerWorkspaceError extends Error {
  public readonly code: PlayerWorkspaceErrorCode;
  public readonly details?: Readonly<Record<string, unknown>>;

  public constructor(
    code: PlayerWorkspaceErrorCode,
    message?: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message ?? code);
    this.name = 'PlayerWorkspaceError';
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export function isPlayerWorkspaceError(value: unknown): value is PlayerWorkspaceError {
  return value instanceof PlayerWorkspaceError;
}
