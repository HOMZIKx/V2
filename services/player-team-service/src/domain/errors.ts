export const PLAYER_TEAM_ERROR_CODES = [
  'DEMO_ACCESS_DENIED',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'REVISION_CONFLICT',
] as const;

export type PlayerTeamErrorCode = (typeof PLAYER_TEAM_ERROR_CODES)[number];

export class PlayerTeamError extends Error {
  public readonly code: PlayerTeamErrorCode;
  public readonly actualRevision: number | null | undefined;

  public constructor(
    code: PlayerTeamErrorCode,
    message?: string,
    options?: { readonly actualRevision?: number | null },
  ) {
    super(message ?? code);
    this.name = 'PlayerTeamError';
    this.code = code;
    this.actualRevision = options?.actualRevision;
  }
}

export function isPlayerTeamError(value: unknown): value is PlayerTeamError {
  return value instanceof PlayerTeamError;
}
