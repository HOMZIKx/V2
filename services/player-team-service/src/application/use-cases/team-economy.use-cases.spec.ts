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
  public readonly dropWorkspaceIds: string[] = [];
  public readonly expenseWorkspaceIds: string[] = [];

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

  public async listDrops(workspaceId: string): Promise<readonly EconomyDropSessionRecord[]> {
    this.dropWorkspaceIds.push(workspaceId);
    return this.drops;
  }

  public async createExpense(input: EconomyExpenseInput): Promise<EconomyExpenseRecord> {
    throw new Error(`not used: ${input.workspaceId}`);
  }

  public async listExpenses(workspaceId: string): Promise<readonly EconomyExpenseRecord[]> {
    this.expenseWorkspaceIds.push(workspaceId);
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

  it('binds the reserved private alias to a different server workspace for each authenticated viewer', async () => {
    const repository = new RepositoryStub();
    const forbiddenStateAccess = {
      async getWorkspaceSnapshot() {
        throw new Error('private economy must not depend on a team workspace');
      },
    } as unknown as PlayerTeamStateUseCases;
    const useCases = new TeamEconomyUseCases(repository, forbiddenStateAccess);

    const firstViewer = '12345678901234567';
    const secondViewer = '98765432109876543';
    const first = await useCases.summary(firstViewer, 'private');
    const second = await useCases.summary(secondViewer, 'private');

    expect(first.workspaceId).toBe('private');
    expect(second.workspaceId).toBe('private');
    expect(repository.dropWorkspaceIds).toHaveLength(2);
    expect(repository.dropWorkspaceIds[0]).not.toBe(repository.dropWorkspaceIds[1]);
    expect(repository.dropWorkspaceIds[0]).toMatch(/^private-economy-[a-f0-9]{40}$/);
    expect(repository.dropWorkspaceIds[0]).not.toContain(firstViewer);
    expect(repository.dropWorkspaceIds[1]).not.toContain(secondViewer);
    expect(repository.expenseWorkspaceIds).toEqual(repository.dropWorkspaceIds);
  });
});
