import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';

import { createLogger } from '@v2/observability';

import { type PlayerTeamEnv } from '../config/player-team-env.js';
import { PLAYER_TEAM_ENV } from '../../interface/player-team.tokens.js';

export type EconomyLeftoverStatus = 'stored' | 'sold' | 'distributed' | 'consumed' | 'moved';

export type EconomyPriceHistoryRecord = {
  readonly id: string;
  readonly itemId: string;
  readonly itemName: string;
  readonly unitPrice: number;
  readonly currency: 'yang' | 'won' | 'gem';
  readonly averagePrice: number;
  readonly sampleCount: number;
  readonly createdBy: string;
  readonly createdAtIso: string;
};

export type EconomyLeftoverRecord = {
  readonly dropItemId: string;
  readonly sessionId: string;
  readonly source: string;
  readonly itemId: string | null;
  readonly itemName: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly currency: 'yang' | 'won' | 'gem';
  readonly status: EconomyLeftoverStatus;
  readonly occurredAtIso: string;
  readonly updatedBy: string;
  readonly updatedAtIso: string;
};

@Injectable()
export class TeamEconomyManagementRepository implements OnModuleInit {
  private readonly logger = createLogger('team-economy-management-repository');
  private pool: Pool | null = null;

  public constructor(@Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv) {}

  public onModuleInit(): void {
    this.pool = new Pool({ connectionString: this.env.PLAYER_TEAM_DATABASE_URL, max: 4 });
    this.logger.info('team economy management database pool created.');
  }

  private get db(): Pool {
    if (this.pool === null) throw new Error('team economy management pool not initialized');
    return this.pool;
  }

  public async listPrices(input: {
    readonly workspaceId: string;
    readonly itemId?: string | undefined;
    readonly limit: number;
  }): Promise<readonly EconomyPriceHistoryRecord[]> {
    // Authorization remains workspace-scoped in the controller, but market prices are shared
    // globally across Destiled workspaces. One team must not build a separate market history.
    const result = await this.db.query(
      `WITH priced AS (
         SELECT p.id,
                p.item_id,
                i.canonical_name AS item_name,
                p.unit_price,
                p.currency,
                p.created_by,
                p.created_at,
                AVG(p.unit_price) OVER (PARTITION BY p.item_id, p.currency) AS average_price,
                COUNT(*) OVER (PARTITION BY p.item_id, p.currency) AS sample_count
         FROM player_team_economy_prices p
         JOIN player_team_economy_items i ON i.id = p.item_id
         WHERE ($1::text IS NULL OR p.item_id = $1)
       )
       SELECT *
       FROM priced
       ORDER BY created_at DESC
       LIMIT $2`,
      [input.itemId ?? null, input.limit],
    );

    return result.rows.map((row) => ({
      id: String(row.id),
      itemId: String(row.item_id),
      itemName: String(row.item_name),
      unitPrice: Number(row.unit_price),
      currency: String(row.currency) as EconomyPriceHistoryRecord['currency'],
      averagePrice: Number(row.average_price),
      sampleCount: Number(row.sample_count),
      createdBy: String(row.created_by),
      createdAtIso: new Date(String(row.created_at)).toISOString(),
    }));
  }

  public async listLeftovers(input: {
    readonly workspaceId: string;
    readonly status?: EconomyLeftoverStatus | undefined;
  }): Promise<readonly EconomyLeftoverRecord[]> {
    const result = await this.db.query(
      `SELECT l.drop_item_id,
              d.session_id,
              s.source,
              d.item_id,
              d.display_name,
              l.quantity,
              d.unit_price,
              d.currency,
              l.status,
              s.occurred_at,
              l.updated_by,
              l.updated_at
       FROM player_team_drop_leftovers l
       JOIN player_team_drop_items d ON d.id = l.drop_item_id
       JOIN player_team_drop_sessions s ON s.id = d.session_id
       WHERE s.workspace_id = $1
         AND ($2::text IS NULL OR l.status = $2)
         AND l.quantity > 0
       ORDER BY CASE WHEN l.status = 'stored' THEN 0 ELSE 1 END,
                s.occurred_at DESC,
                d.display_name`,
      [input.workspaceId, input.status ?? null],
    );

    return result.rows.map((row) => ({
      dropItemId: String(row.drop_item_id),
      sessionId: String(row.session_id),
      source: String(row.source),
      itemId: row.item_id === null || row.item_id === undefined ? null : String(row.item_id),
      itemName: String(row.display_name),
      quantity: Number(row.quantity),
      unitPrice: Number(row.unit_price),
      currency: String(row.currency) as EconomyLeftoverRecord['currency'],
      status: String(row.status) as EconomyLeftoverStatus,
      occurredAtIso: new Date(String(row.occurred_at)).toISOString(),
      updatedBy: String(row.updated_by),
      updatedAtIso: new Date(String(row.updated_at)).toISOString(),
    }));
  }

  public async updateLeftover(input: {
    readonly workspaceId: string;
    readonly dropItemId: string;
    readonly status: EconomyLeftoverStatus;
    readonly updatedBy: string;
  }): Promise<EconomyLeftoverRecord> {
    const allowed = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1
         FROM player_team_drop_leftovers l
         JOIN player_team_drop_items d ON d.id = l.drop_item_id
         JOIN player_team_drop_sessions s ON s.id = d.session_id
         WHERE l.drop_item_id = $1 AND s.workspace_id = $2
       ) AS exists`,
      [input.dropItemId, input.workspaceId],
    );
    if (!allowed.rows[0]?.exists) throw new Error('leftover_not_found');

    await this.db.query(
      `UPDATE player_team_drop_leftovers
       SET status = $2, updated_by = $3, updated_at = NOW()
       WHERE drop_item_id = $1`,
      [input.dropItemId, input.status, input.updatedBy],
    );

    const rows = await this.listLeftovers({ workspaceId: input.workspaceId });
    const updated = rows.find((row) => row.dropItemId === input.dropItemId);
    if (!updated) throw new Error('leftover_not_found_after_update');
    return updated;
  }

  public async updateItemImage(input: {
    readonly itemId: string;
    readonly imageDataUrl: string;
  }): Promise<{ readonly ok: true }> {
    const result = await this.db.query(
      `UPDATE player_team_economy_items
       SET image_url = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [input.itemId, input.imageDataUrl],
    );
    if (!result.rows[0]) throw new Error('item_not_found');
    return { ok: true } as const;
  }

  public async mergeItems(input: {
    readonly targetItemId: string;
    readonly duplicateItemId: string;
    readonly updatedBy: string;
  }): Promise<{ readonly ok: true }> {
    if (input.targetItemId === input.duplicateItemId) throw new Error('cannot_merge_same_item');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await this.assertItemExists(client, input.targetItemId);
      await this.assertItemExists(client, input.duplicateItemId);

      await client.query(
        `INSERT INTO player_team_economy_item_aliases (item_id, alias, created_by, created_at)
         SELECT $1, alias, $3, created_at
         FROM player_team_economy_item_aliases
         WHERE item_id = $2
         ON CONFLICT DO NOTHING`,
        [input.targetItemId, input.duplicateItemId, input.updatedBy],
      );

      const duplicateName = await client.query<{ canonical_name: string }>(
        'SELECT canonical_name FROM player_team_economy_items WHERE id = $1',
        [input.duplicateItemId],
      );
      const alias = duplicateName.rows[0]?.canonical_name?.trim();
      if (alias) {
        await client.query(
          `INSERT INTO player_team_economy_item_aliases (item_id, alias, created_by)
           VALUES ($1,$2,$3)
           ON CONFLICT DO NOTHING`,
          [input.targetItemId, alias, input.updatedBy],
        );
      }

      await client.query(
        'UPDATE player_team_economy_prices SET item_id = $1 WHERE item_id = $2',
        [input.targetItemId, input.duplicateItemId],
      );
      await client.query(
        'UPDATE player_team_drop_items SET item_id = $1 WHERE item_id = $2',
        [input.targetItemId, input.duplicateItemId],
      );
      await client.query('DELETE FROM player_team_economy_item_aliases WHERE item_id = $1', [
        input.duplicateItemId,
      ]);
      await client.query('DELETE FROM player_team_economy_items WHERE id = $1', [
        input.duplicateItemId,
      ]);
      await client.query('COMMIT');
      return { ok: true } as const;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async assertItemExists(client: PoolClient, itemId: string): Promise<void> {
    const result = await client.query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM player_team_economy_items WHERE id = $1) AS exists',
      [itemId],
    );
    if (!result.rows[0]?.exists) throw new Error('item_not_found');
  }
}
