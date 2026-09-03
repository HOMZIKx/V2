import type { Pool } from 'pg';

import { DEFAULT_INTEREST_CATALOG } from '@v2/hub-core';

import {
  assertValidGameAccountDisplayName,
  DEFAULT_GAME_ACCOUNT_DISPLAY_NAME,
  type CreateGameAccountInput,
  type GameAccountView,
  type PlayerPrivateAuditAction,
  type UpdateGameAccountInput,
} from '../../domain/game-account.js';
import {
  assertValidClassSpecKey,
  assertValidPartyRoles,
  resolveClassSpecLabel,
  type InterestCatalogView,
  type PlayerCharacterView,
  type PlayerProfileView,
} from '../../domain/player-profile.js';

export type UpsertCharacterInput = {
  readonly nickname: string;
  readonly classSpecKey: string;
  readonly level?: number | null;
  readonly isDefault?: boolean;
  readonly gameAccountId?: string;
  readonly partyRoles: readonly string[];
};

export class PlayerProfileRepository {
  public constructor(private readonly pool: Pool) {}

  public async ensureProfile(userId: string, displayName: string | null): Promise<void> {
    await this.pool.query(
      `INSERT INTO player_profiles (user_id, display_name)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET
         display_name = COALESCE(EXCLUDED.display_name, player_profiles.display_name),
         updated_at = now()`,
      [userId, displayName],
    );
  }

  public async ensureGameAccountFoundation(userId: string): Promise<void> {
    await this.ensureProfile(userId, null);
    const accounts = await this.listActiveGameAccountRows(userId);
    let defaultAccountId = accounts[0]?.id;
    if (defaultAccountId === undefined) {
      defaultAccountId = await this.insertGameAccount(userId, {
        displayName: DEFAULT_GAME_ACCOUNT_DISPLAY_NAME,
        displayOrder: 0,
      });
      await this.recordPrivateAudit(
        userId,
        'game_account_created',
        'game_account',
        defaultAccountId,
        {
          displayName: DEFAULT_GAME_ACCOUNT_DISPLAY_NAME,
          migrated: true,
        },
      );
    }
    await this.pool.query(
      `UPDATE player_characters
       SET game_account_id = $2, updated_at = now()
       WHERE user_id = $1 AND game_account_id IS NULL`,
      [userId, defaultAccountId],
    );
  }

  public async listGameAccounts(userId: string): Promise<readonly GameAccountView[]> {
    await this.ensureGameAccountFoundation(userId);
    const rows = await this.listActiveGameAccountRows(userId);
    const counts = await this.countCharactersByAccount(userId);
    return rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      description: row.description,
      displayOrder: row.display_order,
      characterCount: counts.get(row.id) ?? 0,
      archivedAt: null,
    }));
  }

  public async createGameAccount(
    userId: string,
    input: CreateGameAccountInput,
  ): Promise<GameAccountView> {
    await this.ensureProfile(userId, null);
    const displayName = assertValidGameAccountDisplayName(input.displayName);
    const id = await this.insertGameAccount(userId, {
      displayName,
      description: input.description ?? null,
      ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
    });
    await this.recordPrivateAudit(userId, 'game_account_created', 'game_account', id, {
      displayName,
    });
    const accounts = await this.listGameAccounts(userId);
    const created = accounts.find((entry) => entry.id === id);
    if (created === undefined) {
      throw new Error('Failed to load created game account');
    }
    return created;
  }

  public async updateGameAccount(
    userId: string,
    accountId: string,
    input: UpdateGameAccountInput,
  ): Promise<GameAccountView> {
    const existing = await this.requireOwnedGameAccount(userId, accountId);
    const displayName =
      input.displayName !== undefined
        ? assertValidGameAccountDisplayName(input.displayName)
        : existing.display_name;
    const description = input.description !== undefined ? input.description : existing.description;
    const displayOrder =
      input.displayOrder !== undefined ? input.displayOrder : existing.display_order;
    await this.pool.query(
      `UPDATE player_game_accounts
       SET display_name = $3, description = $4, display_order = $5, updated_at = now()
       WHERE id = $1::uuid AND user_id = $2 AND archived_at IS NULL`,
      [accountId, userId, displayName, description, displayOrder],
    );
    if (input.displayName !== undefined && input.displayName.trim() !== existing.display_name) {
      await this.recordPrivateAudit(userId, 'game_account_renamed', 'game_account', accountId, {
        from: existing.display_name,
        to: displayName,
      });
    }
    const accounts = await this.listGameAccounts(userId);
    const updated = accounts.find((entry) => entry.id === accountId);
    if (updated === undefined) {
      throw new Error('Game account not found after update');
    }
    return updated;
  }

  public async archiveGameAccount(userId: string, accountId: string): Promise<void> {
    const existing = await this.requireOwnedGameAccount(userId, accountId);
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM player_characters WHERE user_id = $1 AND game_account_id = $2::uuid`,
      [userId, accountId],
    );
    const characterCount = Number(countResult.rows[0]?.count ?? '0');
    if (characterCount > 0) {
      throw new Error('Przenieś postacie na inne konto przed archiwizacją.');
    }
    await this.pool.query(
      `UPDATE player_game_accounts SET archived_at = now(), updated_at = now()
       WHERE id = $1::uuid AND user_id = $2 AND archived_at IS NULL`,
      [accountId, userId],
    );
    await this.recordPrivateAudit(userId, 'game_account_archived', 'game_account', accountId, {
      displayName: existing.display_name,
    });
  }

  public async getProfile(userId: string): Promise<PlayerProfileView | null> {
    await this.ensureGameAccountFoundation(userId);
    const profileResult = await this.pool.query<{
      user_id: string;
      display_name: string | null;
      active_character_id: string | null;
    }>(
      `SELECT user_id, display_name, active_character_id::text
       FROM player_profiles WHERE user_id = $1`,
      [userId],
    );
    const profile = profileResult.rows[0];
    if (profile === undefined) {
      return null;
    }

    const gameAccounts = await this.listGameAccounts(userId);

    const charactersResult = await this.pool.query<{
      id: string;
      nickname: string;
      class_spec_key: string;
      level: number | null;
      is_default: boolean;
      game_account_id: string | null;
    }>(
      `SELECT id::text, nickname, class_spec_key, level, is_default, game_account_id::text
       FROM player_characters WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId],
    );

    const rolesResult = await this.pool.query<{
      character_id: string;
      party_role_key: string;
    }>(
      `SELECT c.id::text AS character_id, r.party_role_key
       FROM player_characters c
       JOIN player_character_party_roles r ON r.character_id = c.id
       WHERE c.user_id = $1`,
      [userId],
    );
    const rolesByCharacter = new Map<string, string[]>();
    for (const row of rolesResult.rows) {
      const list = rolesByCharacter.get(row.character_id) ?? [];
      list.push(row.party_role_key);
      rolesByCharacter.set(row.character_id, list);
    }

    const characters: PlayerCharacterView[] = charactersResult.rows.map((row) => ({
      id: row.id,
      nickname: row.nickname,
      classSpecKey: row.class_spec_key,
      classSpecLabel: resolveClassSpecLabel(row.class_spec_key),
      level: row.level,
      isDefault: row.is_default,
      gameAccountId: row.game_account_id,
      partyRoles: assertValidPartyRoles(rolesByCharacter.get(row.id) ?? []),
    }));

    const interestsResult = await this.pool.query<{ interest_key: string }>(
      `SELECT interest_key FROM user_interests WHERE user_id = $1 ORDER BY interest_key ASC`,
      [userId],
    );

    return {
      userId: profile.user_id,
      displayName: profile.display_name,
      activeCharacterId: profile.active_character_id,
      gameAccounts,
      characters,
      interestKeys: interestsResult.rows.map((row) => row.interest_key),
    };
  }

  public async resolveUserIdByDiscordAccountId(discordUserId: string): Promise<string | null> {
    const result = await this.pool.query<{ userId: string }>(
      `SELECT "userId" AS "userId"
       FROM "account"
       WHERE "providerId" = 'discord' AND "accountId" = $1
       LIMIT 1`,
      [discordUserId],
    );
    return result.rows[0]?.userId ?? null;
  }

  public async resolveDiscordDirectoryEntry(discordUserId: string): Promise<{
    readonly v2UserId: string;
    readonly discordUserId: string;
    readonly displayName: string;
    readonly username: string;
    readonly initials: string;
  } | null> {
    const userId = await this.resolveUserIdByDiscordAccountId(discordUserId);
    if (userId === null) {
      return null;
    }

    const userResult = await this.pool.query<{ name: string }>(
      `SELECT name FROM "user" WHERE id = $1 LIMIT 1`,
      [userId],
    );
    const profileResult = await this.pool.query<{ display_name: string | null }>(
      `SELECT display_name FROM player_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    );

    const authName = userResult.rows[0]?.name?.trim() ?? '';
    const profileName = profileResult.rows[0]?.display_name?.trim() ?? '';
    const displayName =
      profileName.length > 0 ? profileName : authName.length > 0 ? authName : 'Użytkownik';
    const username =
      authName.length > 0
        ? authName.toLowerCase().replace(/\s+/g, '_').slice(0, 32)
        : userId.slice(0, 8);
    const initials =
      displayName
        .split(/\s+/)
        .filter((part) => part.length > 0)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || displayName.slice(0, 2).toUpperCase();

    return {
      v2UserId: userId,
      discordUserId,
      displayName,
      username,
      initials,
    };
  }

  public async getCharacterForUser(
    userId: string,
    characterId: string,
  ): Promise<PlayerCharacterView | null> {
    const characterResult = await this.pool.query<{
      id: string;
      nickname: string;
      class_spec_key: string;
      level: number | null;
      is_default: boolean;
      game_account_id: string | null;
    }>(
      `SELECT id::text, nickname, class_spec_key, level, is_default, game_account_id::text
       FROM player_characters
       WHERE user_id = $1 AND id = $2::uuid`,
      [userId, characterId],
    );
    const row = characterResult.rows[0];
    if (row === undefined) {
      return null;
    }

    const rolesResult = await this.pool.query<{ party_role_key: string }>(
      `SELECT party_role_key FROM player_character_party_roles WHERE character_id = $1::uuid`,
      [row.id],
    );
    const partyRoles = assertValidPartyRoles(rolesResult.rows.map((r) => r.party_role_key));

    return {
      id: row.id,
      nickname: row.nickname,
      classSpecKey: row.class_spec_key,
      classSpecLabel: resolveClassSpecLabel(row.class_spec_key),
      level: row.level,
      isDefault: row.is_default,
      gameAccountId: row.game_account_id,
      partyRoles,
    };
  }

  public async listInterestCatalog(): Promise<readonly InterestCatalogView[]> {
    const result = await this.pool.query<{
      key: string;
      label: string;
      enabled: boolean;
      sort_order: number;
    }>(
      `SELECT key, label, enabled, sort_order FROM interest_catalog ORDER BY sort_order ASC, key ASC`,
    );
    if (result.rows.length === 0) {
      return DEFAULT_INTEREST_CATALOG.map((entry) => ({
        key: entry.key,
        label: entry.label,
        enabled: entry.enabled,
        sortOrder: entry.sortOrder,
      }));
    }
    return result.rows.map((row) => ({
      key: row.key,
      label: row.label,
      enabled: row.enabled,
      sortOrder: row.sort_order,
    }));
  }

  public async setUserInterests(userId: string, interestKeys: readonly string[]): Promise<void> {
    await this.ensureProfile(userId, null);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM user_interests WHERE user_id = $1`, [userId]);
      for (const key of interestKeys) {
        await client.query(
          `INSERT INTO user_interests (user_id, interest_key) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [userId, key],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async upsertCharacter(
    userId: string,
    input: UpsertCharacterInput,
    characterId?: string,
  ): Promise<string> {
    assertValidClassSpecKey(input.classSpecKey);
    const partyRoles = assertValidPartyRoles(input.partyRoles);
    await this.ensureProfile(userId, null);
    await this.ensureGameAccountFoundation(userId);

    let resolvedGameAccountId = input.gameAccountId;
    if (resolvedGameAccountId === undefined) {
      const accounts = await this.listActiveGameAccountRows(userId);
      resolvedGameAccountId = accounts[0]?.id;
    }
    if (resolvedGameAccountId === undefined) {
      throw new Error('Brak konta gry dla postaci.');
    }
    await this.requireOwnedGameAccount(userId, resolvedGameAccountId);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      let id = characterId;
      const isCreate = id === undefined;
      if (id === undefined) {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO player_characters (user_id, nickname, class_spec_key, level, is_default, game_account_id)
           VALUES ($1, $2, $3, $4, $5, $6::uuid)
           RETURNING id::text`,
          [
            userId,
            input.nickname.trim(),
            input.classSpecKey,
            input.level ?? null,
            input.isDefault === true,
            resolvedGameAccountId,
          ],
        );
        id = inserted.rows[0]?.id;
        if (id === undefined) {
          throw new Error('Failed to insert character');
        }
      } else {
        const previous = await client.query<{ game_account_id: string | null }>(
          `SELECT game_account_id::text FROM player_characters WHERE id = $1::uuid AND user_id = $2`,
          [id, userId],
        );
        if (previous.rows[0] === undefined) {
          throw new Error('Postać nie istnieje.');
        }
        await client.query(
          `UPDATE player_characters
           SET nickname = $3, class_spec_key = $4, level = $5, is_default = $6,
               game_account_id = $7::uuid, updated_at = now()
           WHERE id = $1::uuid AND user_id = $2`,
          [
            id,
            userId,
            input.nickname.trim(),
            input.classSpecKey,
            input.level ?? null,
            input.isDefault === true,
            resolvedGameAccountId,
          ],
        );
        await client.query(
          `DELETE FROM player_character_party_roles WHERE character_id = $1::uuid`,
          [id],
        );
        const moved =
          previous.rows[0].game_account_id !== null &&
          previous.rows[0].game_account_id !== resolvedGameAccountId;
        if (moved) {
          await this.recordPrivateAudit(userId, 'character_moved_account', 'character', id, {
            fromAccountId: previous.rows[0].game_account_id,
            toAccountId: resolvedGameAccountId,
          });
        }
      }

      if (input.isDefault === true) {
        await client.query(
          `UPDATE player_characters SET is_default = FALSE WHERE user_id = $1 AND id <> $2::uuid`,
          [userId, id],
        );
        await client.query(
          `UPDATE player_profiles SET active_character_id = $2::uuid, updated_at = now() WHERE user_id = $1`,
          [userId, id],
        );
      }

      for (const role of partyRoles) {
        await client.query(
          `INSERT INTO player_character_party_roles (character_id, party_role_key)
           VALUES ($1::uuid, $2) ON CONFLICT DO NOTHING`,
          [id, role],
        );
      }

      await client.query('COMMIT');
      await this.recordPrivateAudit(
        userId,
        isCreate ? 'character_created' : 'character_edited',
        'character',
        id,
        {
          nickname: input.nickname.trim(),
          classSpecKey: input.classSpecKey,
          gameAccountId: resolvedGameAccountId,
        },
      );
      return id;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async listActiveGameAccountRows(userId: string): Promise<
    readonly {
      id: string;
      display_name: string;
      description: string | null;
      display_order: number;
    }[]
  > {
    const result = await this.pool.query<{
      id: string;
      display_name: string;
      description: string | null;
      display_order: number;
    }>(
      `SELECT id::text, display_name, description, display_order
       FROM player_game_accounts
       WHERE user_id = $1 AND archived_at IS NULL
       ORDER BY display_order ASC, created_at ASC`,
      [userId],
    );
    return result.rows;
  }

  private async countCharactersByAccount(userId: string): Promise<Map<string, number>> {
    const result = await this.pool.query<{ game_account_id: string; count: string }>(
      `SELECT game_account_id::text, COUNT(*)::text AS count
       FROM player_characters
       WHERE user_id = $1 AND game_account_id IS NOT NULL
       GROUP BY game_account_id`,
      [userId],
    );
    const map = new Map<string, number>();
    for (const row of result.rows) {
      map.set(row.game_account_id, Number(row.count));
    }
    return map;
  }

  private async insertGameAccount(
    userId: string,
    input: { displayName: string; description?: string | null; displayOrder?: number },
  ): Promise<string> {
    const displayName = assertValidGameAccountDisplayName(input.displayName);
    let displayOrder = input.displayOrder;
    if (displayOrder === undefined) {
      const maxResult = await this.pool.query<{ max: number | null }>(
        `SELECT COALESCE(MAX(display_order), -1) + 1 AS max
         FROM player_game_accounts WHERE user_id = $1 AND archived_at IS NULL`,
        [userId],
      );
      displayOrder = maxResult.rows[0]?.max ?? 0;
    }
    const inserted = await this.pool.query<{ id: string }>(
      `INSERT INTO player_game_accounts (user_id, display_name, description, display_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id::text`,
      [userId, displayName, input.description ?? null, displayOrder],
    );
    const id = inserted.rows[0]?.id;
    if (id === undefined) {
      throw new Error('Failed to create game account');
    }
    return id;
  }

  private async requireOwnedGameAccount(
    userId: string,
    accountId: string,
  ): Promise<{
    id: string;
    display_name: string;
    description: string | null;
    display_order: number;
  }> {
    const result = await this.pool.query<{
      id: string;
      display_name: string;
      description: string | null;
      display_order: number;
    }>(
      `SELECT id::text, display_name, description, display_order
       FROM player_game_accounts
       WHERE id = $1::uuid AND user_id = $2 AND archived_at IS NULL`,
      [accountId, userId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('Konto nie istnieje lub nie należy do Ciebie.');
    }
    return row;
  }

  private async recordPrivateAudit(
    userId: string,
    action: PlayerPrivateAuditAction,
    entityType: string,
    entityId: string | undefined,
    detail?: Record<string, unknown>,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO player_private_audit (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        userId,
        action,
        entityType,
        entityId ?? null,
        detail === undefined ? null : JSON.stringify(detail),
      ],
    );
  }
}
