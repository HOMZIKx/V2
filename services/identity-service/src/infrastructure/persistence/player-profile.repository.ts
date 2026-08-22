import type { Pool } from 'pg';

import { DEFAULT_INTEREST_CATALOG } from '@v2/hub-core';

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

  public async getProfile(userId: string): Promise<PlayerProfileView | null> {
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

    const charactersResult = await this.pool.query<{
      id: string;
      nickname: string;
      class_spec_key: string;
      level: number | null;
      is_default: boolean;
    }>(
      `SELECT id::text, nickname, class_spec_key, level, is_default
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
    }>(
      `SELECT id::text, nickname, class_spec_key, level, is_default
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

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      let id = characterId;
      if (id === undefined) {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO player_characters (user_id, nickname, class_spec_key, level, is_default)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id::text`,
          [
            userId,
            input.nickname.trim(),
            input.classSpecKey,
            input.level ?? null,
            input.isDefault === true,
          ],
        );
        id = inserted.rows[0]?.id;
        if (id === undefined) {
          throw new Error('Failed to insert character');
        }
      } else {
        await client.query(
          `UPDATE player_characters
           SET nickname = $3, class_spec_key = $4, level = $5, is_default = $6, updated_at = now()
           WHERE id = $1::uuid AND user_id = $2`,
          [
            id,
            userId,
            input.nickname.trim(),
            input.classSpecKey,
            input.level ?? null,
            input.isDefault === true,
          ],
        );
        await client.query(
          `DELETE FROM player_character_party_roles WHERE character_id = $1::uuid`,
          [id],
        );
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
      return id;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
