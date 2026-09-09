import { describe, expect, it } from 'vitest';

import { type TeamEconomyRepositoryPort } from '../../domain/ports/team-economy.port.js';
import { PrivateEconomyUseCases } from './private-economy.use-cases.js';

function repositoryProbe() {
  const seenDropScopes: string[] = [];
  const seenExpenseScopes: string[] = [];

  const repository: TeamEconomyRepositoryPort = {
    async searchItems() {
      return [];
    },
    async catalogStatus() {
      return { total: 0 };
    },
    async importItems() {
      return { imported: 0, total: 0 };
    },
    async createItem(input) {
      return {
        id: 'item-1',
        canonicalName: input.canonicalName,
        category: input.category,
        imageUrl: input.imageUrl ?? null,
        lastPrice: null,
      };
    },
    async updateItem(input) {
      return {
        id: input.itemId,
        canonicalName: input.canonicalName ?? 'Item',
        category: input.category ?? 'Pozostałe',
        imageUrl: input.imageUrl ?? null,
        lastPrice: null,
      };
    },
    async addPrice(input) {
      seenDropScopes.push(input.workspaceId);
    },
    async createDrop(input) {
      seenDropScopes.push(input.workspaceId);
      return {
        id: 'drop-1',
        workspaceId: input.workspaceId,
        source: input.source,
        occurredAtIso: input.occurredAtIso,
        notes: input.notes ?? null,
        ourShareBasisPoints: input.ourShareBasisPoints,
        pileCount: input.pileCount,
        splitMode: input.splitMode,
        createdBy: input.createdBy,
        items: [],
        money: [],
        participants: input.participants,
      };
    },
    async listDrops(workspaceId) {
      seenDropScopes.push(workspaceId);
      return [];
    },
    async createExpense(input) {
      seenExpenseScopes.push(input.workspaceId);
      return { id: 'expense-1', ...input };
    },
    async listExpenses(workspaceId) {
      seenExpenseScopes.push(workspaceId);
      return [];
    },
  };

  return { repository, seenDropScopes, seenExpenseScopes };
}

describe('PrivateEconomyUseCases', () => {
  it('derives a stable private scope from the authenticated viewer only', async () => {
    const probe = repositoryProbe();
    const useCases = new PrivateEconomyUseCases(probe.repository);

    await useCases.listDrops('discord-user-a');
    await useCases.listExpenses('discord-user-a');
    await useCases.listDrops('discord-user-b');
    await useCases.listExpenses('discord-user-b');

    const scopeA = probe.seenDropScopes[0];
    const scopeB = probe.seenDropScopes[1];

    expect(scopeA).toBe(probe.seenExpenseScopes[0]);
    expect(scopeB).toBe(probe.seenExpenseScopes[1]);
    expect(scopeA).not.toBe(scopeB);
    expect(scopeA).toMatch(/^private:[a-f0-9]{64}$/);
    expect(scopeB).toMatch(/^private:[a-f0-9]{64}$/);
    expect(scopeA).not.toContain('discord-user-a');
    expect(scopeB).not.toContain('discord-user-b');
  });

  it('forces writes into the same derived private scope', async () => {
    const probe = repositoryProbe();
    const useCases = new PrivateEconomyUseCases(probe.repository);

    await useCases.listDrops('discord-user-a');
    const expectedScope = probe.seenDropScopes[0];

    await useCases.createDrop('discord-user-a', {
      source: 'Azrael',
      occurredAtIso: '2026-09-09T10:00:00.000Z',
      ourShareBasisPoints: 10_000,
      pileCount: 1,
      splitMode: 'max_equal',
      participants: [],
      items: [],
      money: [{ currency: 'yang', totalAmount: 1, ourShareBasisPoints: 10_000 }],
    });

    expect(probe.seenDropScopes[1]).toBe(expectedScope);
  });
});
