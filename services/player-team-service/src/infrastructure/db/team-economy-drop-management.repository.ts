import { randomUUID } from 'node:crypto';

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { createLogger } from '@v2/observability';

import { splitOwnedQuantity } from '../../domain/team-economy.js';
import { type EconomyDropSessionInput } from '../../domain/ports/team-economy.port.js';
import { PLAYER_TEAM_ENV } from '../../interface/player-team.tokens.js';
import { type PlayerTeamEnv } from '../config/player-team-env.js';

type EconomyDropReplacementItem = EconomyDropSessionInput['items'][number] & {
  readonly dropItemId?: string | null | undefined;
};

export type EconomyDropReplacement = Omit<
  EconomyDropSessionInput,
  'workspaceId' | 'createdBy' | 'items'
> & {
  readonly workspaceId: string;
  readonly dropId: string;
  readonly updatedBy: string;
  readonly items: readonly EconomyDropReplacementItem[];
};

type ExistingDropItemRow = {
  id: string;
  item_id: string | null;
  unit_price: string | number;
  currency: string;
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

      const existingResult = await client.query<ExistingDropItemRow>(
        `SELECT id, item_id, unit_price, currency
         FROM player_team_drop_items
         WHERE session_id = $1`,
        [input.dropId],
      );
      const existingById = new Map(existingResult.rows.map((row) => [row.id, row]));
      const retainedItemIds = new Set<string>();

      await client.query('DELETE FROM player_team_drop_participants WHERE session_id = $1', [input.dropId]);
      await client.query('DELETE FROM player_team_drop_money WHERE session_id = $1', [input.dropId]);

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
        const requestedDropItemId = item.dropItemId?.trim() || null;
        let dropItemId: string;
        let shouldObservePrice = false;

        if (requestedDropItemId) {
          const existing = existingById.get(requestedDropItemId);
          if (!existing) throw new Error('drop_item_not_found');
          dropItemId = requestedDropItemId;
          retainedItemIds.add(dropItemId);
          shouldObservePrice =
            existing.item_id !== item.itemId ||
            Number(existing.unit_price) !== item.unitPrice ||
            existing.currency !== item.currency;

          await client.query(
            `UPDATE player_team_drop_items
             SET item_id = $2,
                 display_name = $3,
                 total_quantity = $4,
                 our_quantity = $5,
                 unit_price = $6,
                 currency = $7,
                 ai_confidence = $8
             WHERE id = $1 AND session_id = $9`,
            [
              dropItemId,
              item.itemId,
              item.displayName,
              item.totalQuantity,
              item.ourQuantity,
              item.unitPrice,
              item.currency,
              item.aiConfidence ?? null,
              input.dropId,
            ],
          );
        } else {
          dropItemId = randomUUID();
          shouldObservePrice = true;
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
        }

        const split = splitOwnedQuantity(item.ourQuantity, input.pileCount, input.splitMode);
        const leftoverUpdated = await client.query(
          `UPDATE player_team_drop_leftovers
           SET quantity = $2, updated_at = NOW()
           WHERE drop_item_id = $1
           RETURNING drop_item_id`,
          [dropItemId, split.leftover],
        );
        if (!leftoverUpdated.rows[0]) {
          await client.query(
            `INSERT INTO player_team_drop_leftovers
               (drop_item_id, quantity, status, updated_by, updated_at)
             VALUES ($1,$2,'stored',$3,NOW())`,
            [dropItemId, split.leftover, input.updatedBy],
          );
        }

        if (shouldObservePrice && item.itemId && item.unitPrice > 0) {
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

      for (const existing of existingResult.rows) {
        if (retainedItemIds.has(existing.id)) continue;
        await client.query(
          'DELETE FROM player_team_drop_items WHERE id = $1 AND session_id = $2',
          [existing.id, input.dropId],
        );
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
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      // Costs explicitly assigned to a run belong to that run. Deleting the run must not
      // silently transform them into general team costs.
      await client.query(
        `DELETE FROM player_team_expenses
         WHERE drop_session_id = $1 AND workspace_id = $2`,
        [input.dropId, input.workspaceId],
      );
      const result = await client.query<{ id: string }>(
        `DELETE FROM player_team_drop_sessions
         WHERE id = $1 AND workspace_id = $2
         RETURNING id`,
        [input.dropId, input.workspaceId],
      );
      if (!result.rows[0]) throw new Error('drop_not_found');
      await client.query('COMMIT');
      return { ok: true } as const;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
