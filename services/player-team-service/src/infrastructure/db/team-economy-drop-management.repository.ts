import { randomUUID } from 'node:crypto';

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { createLogger } from '@v2/observability';

import { splitOwnedQuantity } from '../../domain/team-economy.js';
import { type EconomyDropSessionInput } from '../../domain/ports/team-economy.port.js';
import { PLAYER_TEAM_ENV } from '../../interface/player-team.tokens.js';
import { type PlayerTeamEnv } from '../config/player-team-env.js';

export type EconomyDropReplacement = Omit<EconomyDropSessionInput, 'workspaceId' | 'createdBy'> & {
  readonly workspaceId: string;
  readonly dropId: string;
  readonly updatedBy: string;
};

@Injectable()
export class TeamEconomyDropManagementRepository implements OnModuleInit {
  private readonly logger = createLogger('team-economy-drop-management-repository');
  private pool: Pool | null = null;

  public constructor(@Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv) {}

  public onModuleInit(): void {
    this.pool = new Pool({ connectionString: this.env.PLAYER_TEAM_DATABASE_URL, max: 4 });
    this.logger.info('team economy drop management database pool created.');
  }

  private get db(): Pool {
    if (this.pool === null) throw new Error('team economy drop management pool not initialized');
    return this.pool;
  }

  public async replaceDrop(input: EconomyDropReplacement): Promise<{ readonly ok: true }> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query<{ id: string }>(
        `UPDATE player_team_drop_sessions
         SET source = $3,
             occurred_at = $4,
             notes = $5,
             screenshot_ref = $6,
             our_share_basis_points = $7,
             pile_count = $8,
             split_mode = $9,
             updated_at = NOW()
         WHERE id = $1 AND workspace_id = $2
         RETURNING id`,
        [
          input.dropId,
          input.workspaceId,
          input.source,
          input.occurredAtIso,
          input.notes ?? null,
          input.screenshotRef ?? null,
          input.ourShareBasisPoints,
          input.pileCount,
          input.splitMode,
        ],
      );
      if (!updated.rows[0]) throw new Error('drop_not_found');

      await client.query('DELETE FROM player_team_drop_participants WHERE session_id = $1', [input.dropId]);
      await client.query('DELETE FROM player_team_drop_money WHERE session_id = $1', [input.dropId]);
      await client.query('DELETE FROM player_team_drop_items WHERE session_id = $1', [input.dropId]);

      for (const participant of input.participants) {
        await client.query(
          `INSERT INTO player_team_drop_participants
             (session_id, participant_id, display_name, is_team_member)
           VALUES ($1,$2,$3,$4)`,
          [
            input.dropId,
            participant.participantId,
            participant.displayName,
            participant.isTeamMember,
          ],
        );
      }

      for (const item of input.items) {
        const dropItemId = randomUUID();
        await client.query(
          `INSERT INTO player_team_drop_items
             (id, session_id, item_id, display_name, total_quantity, our_quantity, unit_price, currency, ai_confidence)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            dropItemId,
            input.dropId,
            item.itemId,
            item.displayName,
            item.totalQuantity,
            item.ourQuantity,
            item.unitPrice,
            item.currency,
            item.aiConfidence ?? null,
          ],
        );
        const split = splitOwnedQuantity(item.ourQuantity, input.pileCount, input.splitMode);
        await client.query(
          `INSERT INTO player_team_drop_leftovers
             (drop_item_id, quantity, status, updated_by, updated_at)
           VALUES ($1,$2,'stored',$3,NOW())`,
          [dropItemId, split.leftover, input.updatedBy],
        );
        if (item.itemId && item.unitPrice > 0) {
          await client.query(
            `INSERT INTO player_team_economy_prices
               (id, item_id, workspace_id, unit_price, currency, created_by, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
            [
              randomUUID(),
              item.itemId,
              input.workspaceId,
              item.unitPrice,
              item.currency,
              input.updatedBy,
            ],
          );
        }
      }

      for (const money of input.money) {
        await client.query(
          `INSERT INTO player_team_drop_money
             (id, session_id, currency, total_amount, our_share_basis_points, created_at)
           VALUES ($1,$2,$3,$4,$5,NOW())`,
          [
            randomUUID(),
            input.dropId,
            money.currency,
            money.totalAmount,
            money.ourShareBasisPoints,
          ],
        );
      }

      await client.query('COMMIT');
      return { ok: true } as const;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  public async deleteDrop(input: {
    readonly workspaceId: string;
    readonly dropId: string;
  }): Promise<{ readonly ok: true }> {
    const result = await this.db.query<{ id: string }>(
      `DELETE FROM player_team_drop_sessions
       WHERE id = $1 AND workspace_id = $2
       RETURNING id`,
      [input.dropId, input.workspaceId],
    );
    if (!result.rows[0]) throw new Error('drop_not_found');
    return { ok: true } as const;
  }
}
