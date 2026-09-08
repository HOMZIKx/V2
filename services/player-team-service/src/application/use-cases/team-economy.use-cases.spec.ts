import { describe, expect, it } from 'vitest';

import type {
  EconomyCatalogItem,
  EconomyCatalogSeedItem,
  EconomyDropSessionInput,
  EconomyDropSessionRecord,
  EconomyExpenseInput,
  EconomyExpenseRecord,
  TeamEconomyRepositoryPort,
} from '../../domain/ports/team-economy.port.js';
import type { PlayerTeamStateUseCases } from './player-team-state.use-cases.js';
import { TeamEconomyUseCases } from './team-economy.use-cases.js';

class RepositoryStub implements TeamEconomyRepositoryPort {
  public drops: EconomyDropSessionRecord[] = [];
  public expenses: EconomyExpenseRecord[] = [];

  public async catalogStatus() {
    return { total: 0 };
  }

  public async searchItems(): Promise<readonly EconomyCatalogItem[]> {
    return [];
  }

  public async importItems(input: {
    readonly items: readonly EconomyCatalogSeedItem[];
    readonly createdBy: string;
  }) {
    return { imported: input.items.length, total: input.items.length };
  }

  public async createItem(): Promise<EconomyCatalogItem> {
    throw new Error('not used');
  }

  public async updateItem(): Promise<EconomyCatalogItem> {
    throw new Error('not used');
  }

  public async addPrice(): Promise<void> {}

  public async createDrop(input: EconomyDropSessionInput): Promise<EconomyDropSessionRecord> {
    throw new Error(`not used: ${input.workspaceId}`);
  }

  public async listDrops(): Promise<readonly EconomyDropSessionRecord[]> {
    return this.drops;
  }

  public async createExpense(input: EconomyExpenseInput): Promise<EconomyExpenseRecord> {
    throw new Error(`not used: ${input.workspaceId}`);
  }

  public async listExpenses(): Promise<readonly EconomyExpenseRecord[]> {
    return this.expenses;
  }
}

function stateUseCasesStub(): PlayerTeamStateUseCases {
  return {
    async getWorkspaceSnapshot() {
      return {
        workspaceId: 'workspace-1',
        state: {
          members: [
            {
              id: 'member-1',
              discordAccountId: '12345678901234567',
              role: 'owner',
            },
          ],
        },
        revision: 0,
        updatedByUserId: '12345678901234567',
        updatedAtIso: new Date(0).toISOString(),
      };
    },
  } as unknown as PlayerTeamStateUseCases;
}

describe('TeamEconomyUseCases.summary', () => {
  it('adds integer-owned item value and percentage-owned money, then subtracts attributed costs', async () => {
    const repository = new RepositoryStub();
    repository.drops = [
      {
        id: 'drop-1',
        workspaceId: 'workspace-1',
        source: 'Azrael',
        occurredAtIso: new Date(0).toISOString(),
        notes: null,
        ourShareBasisPoints: 5_000,
        pileCount: 2,
        splitMode: 'max_equal',
        createdBy: '12345678901234567',
        participants: [],
        items: [
          {
            id: 'drop-item-1',
            itemId: 'item-1',
            displayName: 'Biała Perła',
            totalQuantity: 5,
            ourQuantity: 2,
            unitPrice: 100,
            currency: 'yang',
            aiConfidence: null,
            perPile: 1,
            leftover: 0,
          },
        ],
        money: [
          {
            id: 'money-1',
            currency: 'yang',
            totalAmount: 1_000,
            ourShareBasisPoints: 5_000,
            ourAmount: 500,
          },
        ],
      },
    ];
    repository.expenses = [
      {
        id: 'expense-1',
        workspaceId: 'workspace-1',
        label: 'Przepustki',
        expenseType: 'item',
        quantity: 2,
        unitPrice: 100,
        currency: 'yang',
        ourShareBasisPoints: 5_000,
        occurredAtIso: new Date(0).toISOString(),
        createdBy: '12345678901234567',
      },
    ];

    const useCases = new TeamEconomyUseCases(repository, stateUseCasesStub());
    const result = await useCases.summary('12345678901234567', 'workspace-1');
    const yang = result.totals.find((entry) => entry.currency === 'yang');

    expect(yang).toEqual({
      currency: 'yang',
      gross: 700,
      itemGross: 200,
      moneyGross: 500,
      costs: 100,
      net: 600,
    });
  });
});
