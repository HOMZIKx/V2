import { randomUUID } from 'node:crypto';

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';

import { createLogger } from '@v2/observability';

import { splitOwnedQuantity, type TeamEconomySplitMode } from '../../domain/team-economy.js';
import {
  type EconomyCatalogItem,
  type EconomyCurrency,
  type EconomyDropSessionInput,
  type EconomyDropSessionRecord,
  type EconomyExpenseInput,
  type EconomyExpenseRecord,
  type TeamEconomyRepositoryPort,
} from '../../domain/ports/team-economy.port.js';
import { type PlayerTeamEnv } from '../config/player-team-env.js';
import { PLAYER_TEAM_ENV } from '../../interface/player-team.tokens.js';

@Injectable()
export class TeamEconomyRepository implements TeamEconomyRepositoryPort, OnModuleInit {
  private readonly logger = createLogger('team-economy-repository');
  private pool: Pool | null = null;

  public constructor(@Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv) {}

  public onModuleInit(): void {
    this.pool = new Pool({ connectionString: this.env.PLAYER_TEAM_DATABASE_URL, max: 10 });
    this.logger.info('team economy database pool created.');
  }

  private get db(): Pool {
    if (this.pool === null) throw new Error('team economy pool not initialized');
    return this.pool;
  }

  private mapCatalogRow(row: Record<string, unknown>): EconomyCatalogItem {
    const price = row.last_unit_price === null || row.last_unit_price === undefined
      ? null
      : {
          unitPrice: Number(row.last_unit_price),
          currency: String(row.last_currency) as EconomyCurrency,
          createdAtIso: new Date(String(row.last_price_at)).toISOString(),
        };
    return {
      id: String(row.id),
      canonicalName: String(row.canonical_name),
      category: String(row.category),
      imageUrl: row.image_url === null || row.image_url === undefined ? null : String(row.image_url),
      lastPrice: price,
    };
  }

  public async searchItems(workspaceId: string, query: string): Promise<readonly EconomyCatalogItem[]> {
    const needle = query.trim();
    const result = await this.db.query(
      `SELECT DISTINCT ON (i.id)
         i.id, i.canonical_name, i.category, i.image_url,
         lp.unit_price AS last_unit_price, lp.currency AS last_currency, lp.created_at AS last_price_at
       FROM player_team_economy_items i
       LEFT JOIN player_team_economy_item_aliases a ON a.item_id = i.id
       LEFT JOIN LATERAL (
         SELECT p.unit_price, p.currency, p.created_at
         FROM player_team_economy_prices p
         WHERE p.item_id = i.id AND p.workspace_id = $1
         ORDER BY p.created_at DESC LIMIT 1
       ) lp ON TRUE
       WHERE $2 = '' OR i.canonical_name ILIKE '%' || $2 || '%' OR a.alias ILIKE '%' || $2 || '%'
       ORDER BY i.id, i.canonical_name
       LIMIT 40`,
      [workspaceId, needle],
    );
    return result.rows.map((row) => this.mapCatalogRow(row));
  }

  private async catalogItemById(client: Pool | PoolClient, itemId: string, workspaceId = ''): Promise<EconomyCatalogItem> {
    const result = await client.query(
      `SELECT i.id, i.canonical_name, i.category, i.image_url,
         lp.unit_price AS last_unit_price, lp.currency AS last_currency, lp.created_at AS last_price_at
       FROM player_team_economy_items i
       LEFT JOIN LATERAL (
         SELECT p.unit_price, p.currency, p.created_at
         FROM player_team_economy_prices p
         WHERE p.item_id = i.id AND ($2 = '' OR p.workspace_id = $2)
         ORDER BY p.created_at DESC LIMIT 1
       ) lp ON TRUE
       WHERE i.id = $1`,
      [itemId, workspaceId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error('economy item not found');
    return this.mapCatalogRow(row);
  }

  public async createItem(input: {
    canonicalName: string;
    category: string;
    imageUrl?: string | null;
    alias?: string | null;
    createdBy: string;
  }): Promise<EconomyCatalogItem> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        'SELECT id FROM player_team_economy_items WHERE LOWER(canonical_name) = LOWER($1) LIMIT 1',
        [input.canonicalName.trim()],
      );
      let itemId: string;
      if (existing.rows[0]?.id) {
        itemId = String(existing.rows[0].id);
      } else {
        itemId = randomUUID();
        await client.query(
          `INSERT INTO player_team_economy_items
             (id, canonical_name, category, image_url, created_by, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`,
          [itemId, input.canonicalName.trim(), input.category.trim() || 'Pozostałe', input.imageUrl ?? null, input.createdBy],
        );
      }
      const alias = input.alias?.trim();
      if (alias) {
        await client.query(
          `INSERT INTO player_team_economy_item_aliases (item_id, alias, created_by)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [itemId, alias, input.createdBy],
        );
      }
      await client.query('COMMIT');
      return this.catalogItemById(this.db, itemId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async updateItem(input: {
    itemId: string;
    canonicalName?: string;
    category?: string;
    imageUrl?: string | null;
    alias?: string | null;
    updatedBy: string;
  }): Promise<EconomyCatalogItem> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE player_team_economy_items
         SET canonical_name = COALESCE($2, canonical_name),
             category = COALESCE($3, category),
             image_url = CASE WHEN $4::boolean THEN $5 ELSE image_url END,
             updated_at = NOW()
         WHERE id = $1`,
        [
          input.itemId,
          input.canonicalName?.trim() || null,
          input.category?.trim() || null,
          input.imageUrl !== undefined,
          input.imageUrl ?? null,
        ],
      );
      const alias = input.alias?.trim();
      if (alias) {
        await client.query(
          `INSERT INTO player_team_economy_item_aliases (item_id, alias, created_by)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [input.itemId, alias, input.updatedBy],
        );
      }
      await client.query('COMMIT');
      return this.catalogItemById(this.db, input.itemId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async addPrice(input: {
    workspaceId: string;
    itemId: string;
    unitPrice: number;
    currency: EconomyCurrency;
    createdBy: string;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO player_team_economy_prices
         (id, item_id, workspace_id, unit_price, currency, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [randomUUID(), input.itemId, input.workspaceId, input.unitPrice, input.currency, input.createdBy],
    );
  }

  public async createDrop(input: EconomyDropSessionInput): Promise<EconomyDropSessionRecord> {
    const client = await this.db.connect();
    const sessionId = randomUUID();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO player_team_drop_sessions
           (id, workspace_id, source, occurred_at, notes, screenshot_ref, our_share_basis_points,
            pile_count, split_mode, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())`,
        [sessionId, input.workspaceId, input.source, input.occurredAtIso, input.notes ?? null,
          input.screenshotRef ?? null, input.ourShareBasisPoints, input.pileCount, input.splitMode, input.createdBy],
      );
      for (const participant of input.participants) {
        await client.query(
          `INSERT INTO player_team_drop_participants
             (session_id, participant_id, display_name, is_team_member)
           VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [sessionId, participant.participantId, participant.displayName, participant.isTeamMember],
        );
      }
      for (const item of input.items) {
        const dropItemId = randomUUID();
        await client.query(
          `INSERT INTO player_team_drop_items
             (id, session_id, item_id, display_name, total_quantity, our_quantity, unit_price, currency, ai_confidence)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [dropItemId, sessionId, item.itemId, item.displayName, item.totalQuantity, item.ourQuantity,
            item.unitPrice, item.currency, item.aiConfidence ?? null],
        );
        const split = splitOwnedQuantity(item.ourQuantity, input.pileCount, input.splitMode);
        await client.query(
          `INSERT INTO player_team_drop_leftovers (drop_item_id, quantity, status, updated_by, updated_at)
           VALUES ($1,$2,'stored',$3,NOW())`,
          [dropItemId, split.leftover, input.createdBy],
        );
        if (item.itemId && item.unitPrice >= 0) {
          await client.query(
            `INSERT INTO player_team_economy_prices
               (id, item_id, workspace_id, unit_price, currency, created_by, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
            [randomUUID(), item.itemId, input.workspaceId, item.unitPrice, item.currency, input.createdBy],
          );
        }
      }
      await client.query('COMMIT');
      const created = await this.listDrops(input.workspaceId);
      const record = created.find((entry) => entry.id === sessionId);
      if (!record) throw new Error('created economy drop not found');
      return record;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  public async listDrops(workspaceId: string, sinceIso?: string): Promise<readonly EconomyDropSessionRecord[]> {
    const sessions = await this.db.query(
      `SELECT * FROM player_team_drop_sessions
       WHERE workspace_id = $1 AND ($2::timestamptz IS NULL OR occurred_at >= $2::timestamptz)
       ORDER BY occurred_at DESC LIMIT 250`,
      [workspaceId, sinceIso ?? null],
    );
    const result: EconomyDropSessionRecord[] = [];
    for (const row of sessions.rows) {
      const [itemsResult, participantsResult] = await Promise.all([
        this.db.query(
          `SELECT i.*, l.quantity AS leftover
           FROM player_team_drop_items i
           LEFT JOIN player_team_drop_leftovers l ON l.drop_item_id = i.id
           WHERE i.session_id = $1 ORDER BY i.created_at, i.id`,
          [row.id],
        ),
        this.db.query(
          `SELECT participant_id, display_name, is_team_member
           FROM player_team_drop_participants WHERE session_id = $1 ORDER BY display_name`,
          [row.id],
        ),
      ]);
      const pileCount = Number(row.pile_count);
      const splitMode = String(row.split_mode) as TeamEconomySplitMode;
      result.push({
        id: String(row.id),
        workspaceId: String(row.workspace_id),
        source: String(row.source),
        occurredAtIso: new Date(row.occurred_at).toISOString(),
        notes: row.notes === null ? null : String(row.notes),
        ourShareBasisPoints: Number(row.our_share_basis_points),
        pileCount,
        splitMode,
        createdBy: String(row.created_by),
        participants: participantsResult.rows.map((participant) => ({
          participantId: String(participant.participant_id),
          displayName: String(participant.display_name),
          isTeamMember: Boolean(participant.is_team_member),
        })),
        items: itemsResult.rows.map((item) => {
          const split = splitOwnedQuantity(Number(item.our_quantity), pileCount, splitMode);
          return {
            id: String(item.id),
            itemId: item.item_id === null ? null : String(item.item_id),
            displayName: String(item.display_name),
            totalQuantity: Number(item.total_quantity),
            ourQuantity: Number(item.our_quantity),
            unitPrice: Number(item.unit_price),
            currency: String(item.currency) as EconomyCurrency,
            aiConfidence: item.ai_confidence === null ? null : Number(item.ai_confidence),
            perPile: split.perPile,
            leftover: Number(item.leftover ?? split.leftover),
          };
        }),
      });
    }
    return result;
  }

  public async createExpense(input: EconomyExpenseInput): Promise<EconomyExpenseRecord> {
    const id = randomUUID();
    await this.db.query(
      `INSERT INTO player_team_expenses
         (id, workspace_id, drop_session_id, label, expense_type, quantity, unit_price, currency,
          our_share_basis_points, occurred_at, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
      [id, input.workspaceId, input.dropSessionId ?? null, input.label, input.expenseType, input.quantity,
        input.unitPrice, input.currency, input.ourShareBasisPoints, input.occurredAtIso, input.createdBy],
    );
    return { ...input, id };
  }

  public async listExpenses(workspaceId: string, sinceIso?: string): Promise<readonly EconomyExpenseRecord[]> {
    const result = await this.db.query(
      `SELECT * FROM player_team_expenses
       WHERE workspace_id = $1 AND ($2::timestamptz IS NULL OR occurred_at >= $2::timestamptz)
       ORDER BY occurred_at DESC LIMIT 500`,
      [workspaceId, sinceIso ?? null],
    );
    return result.rows.map((row) => ({
      id: String(row.id), workspaceId: String(row.workspace_id),
      dropSessionId: row.drop_session_id === null ? null : String(row.drop_session_id),
      label: String(row.label), expenseType: String(row.expense_type) as EconomyExpenseRecord['expenseType'],
      quantity: Number(row.quantity), unitPrice: Number(row.unit_price), currency: String(row.currency) as EconomyCurrency,
      ourShareBasisPoints: Number(row.our_share_basis_points),
      occurredAtIso: new Date(row.occurred_at).toISOString(), createdBy: String(row.created_by),
    }));
  }
}
