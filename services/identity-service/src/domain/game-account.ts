/** Default logical account for migrated users without explicit game accounts. */
export const DEFAULT_GAME_ACCOUNT_DISPLAY_NAME = 'Moje konto';

export type GameAccountView = {
  readonly id: string;
  readonly displayName: string;
  readonly description: string | null;
  readonly displayOrder: number;
  readonly characterCount: number;
  readonly archivedAt: string | null;
};

export type CreateGameAccountInput = {
  readonly displayName: string;
  readonly description?: string | null;
  readonly displayOrder?: number;
};

export type UpdateGameAccountInput = {
  readonly displayName?: string;
  readonly description?: string | null;
  readonly displayOrder?: number;
};

export type PlayerPrivateAuditAction =
  | 'game_account_created'
  | 'game_account_renamed'
  | 'game_account_archived'
  | 'character_created'
  | 'character_edited'
  | 'character_moved_account'
  | 'character_archived';

export function assertValidGameAccountDisplayName(displayName: string): string {
  const trimmed = displayName.trim();
  if (trimmed.length < 1 || trimmed.length > 64) {
    throw new Error('Nazwa konta musi mieć od 1 do 64 znaków.');
  }
  return trimmed;
}
