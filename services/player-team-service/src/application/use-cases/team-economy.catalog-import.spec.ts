import { describe, expect, it } from 'vitest';

import type { TeamEconomyRepositoryPort } from '../../domain/ports/team-economy.port.js';
import type { PlayerTeamStateUseCases } from './player-team-state.use-cases.js';
import { TeamEconomyUseCases } from './team-economy.use-cases.js';

function repositoryStub(): TeamEconomyRepositoryPort {
  return {
    async searchItems() { return []; },
    async catalogStatus() { return { total: 0 }; },
    async importItems(input) { return { imported: input.items.length, total: input.items.length }; },
    async createItem() { throw new Error('not used'); },
    async updateItem() { throw new Error('not used'); },
    async addPrice() {},
    async createDrop() { throw new Error('not used'); },
    async listDrops() { return []; },
    async createExpense() { throw new Error('not used'); },
    async listExpenses() { return []; },
  };
}

function stateStub(): PlayerTeamStateUseCases {
  return {
    async getWorkspaceSnapshot() {
      return {
        workspaceId: 'workspace-1',
        state: { members: [] },
        revision: 0,
        updatedByUserId: 'viewer-1',
        updatedAtIso: new Date(0).toISOString(),
      };
    },
  } as unknown as PlayerTeamStateUseCases;
}

describe('TeamEconomyUseCases catalog import', () => {
  it('imports DOBRYTEMAT-style canonical items after workspace access succeeds', async () => {
    const useCases = new TeamEconomyUseCases(repositoryStub(), stateStub());
    const result = await useCases.importItems('viewer-1', 'workspace-1', [
      { id: 'wiki-1', canonicalName: 'Biała Perła', category: 'Ulepszacze', imageUrl: '/item.png' },
      { id: 'wiki-2', canonicalName: 'Zwój Błogosławieństwa', category: 'Specjalne', imageUrl: null },
    ]);
    expect(result).toEqual({ imported: 2, total: 2 });
  });
});
