import { createHash } from 'node:crypto';

import {
  type EconomyCurrency,
  type EconomyDropSessionInput,
  type EconomyExpenseInput,
  type TeamEconomyRepositoryPort,
} from '../../domain/ports/team-economy.port.js';

/**
 * Private economy reuses the durable economy tables, but never accepts a workspace id from the client.
 * The persistence scope is deterministically derived from the authenticated viewer and is therefore
 * impossible to switch by changing a request parameter.
 */
export class PrivateEconomyUseCases {
  public constructor(private readonly repository: TeamEconomyRepositoryPort) {}

  private scope(viewerId: string): string {
    const digest = createHash('sha256').update(`destiled-private-economy:${viewerId}`).digest('hex');
    return `private:${digest}`;
  }

  public async searchItems(viewerId: string, query: string) {
    return this.repository.searchItems(this.scope(viewerId), query);
  }

  public async createItem(
    viewerId: string,
    input: {
      canonicalName: string;
      category: string;
      imageUrl?: string | null | undefined;
      alias?: string | null | undefined;
    },
  ) {
    return this.repository.createItem({ ...input, createdBy: viewerId });
  }

  public async addPrice(
    viewerId: string,
    input: { itemId: string; unitPrice: number; currency: EconomyCurrency },
  ) {
    await this.repository.addPrice({
      workspaceId: this.scope(viewerId),
      ...input,
      createdBy: viewerId,
    });
    return { ok: true } as const;
  }

  public async createDrop(
    viewerId: string,
    input: Omit<EconomyDropSessionInput, 'workspaceId' | 'createdBy'>,
  ) {
    return this.repository.createDrop({
      ...input,
      workspaceId: this.scope(viewerId),
      createdBy: viewerId,
    });
  }

  public async listDrops(viewerId: string, sinceIso?: string) {
    return this.repository.listDrops(this.scope(viewerId), sinceIso);
  }

  public async createExpense(
    viewerId: string,
    input: Omit<EconomyExpenseInput, 'workspaceId' | 'createdBy'>,
  ) {
    return this.repository.createExpense({
      ...input,
      workspaceId: this.scope(viewerId),
      createdBy: viewerId,
    });
  }

  public async listExpenses(viewerId: string, sinceIso?: string) {
    return this.repository.listExpenses(this.scope(viewerId), sinceIso);
  }

  public async summary(viewerId: string, sinceIso?: string) {
    const scope = this.scope(viewerId);
    const [drops, expenses] = await Promise.all([
      this.repository.listDrops(scope, sinceIso),
      this.repository.listExpenses(scope, sinceIso),
    ]);
    const currencies: EconomyCurrency[] = ['yang', 'won', 'gem'];
    const totals = currencies.map((currency) => {
      const itemGross = drops.reduce(
        (sessionTotal, session) =>
          sessionTotal +
          session.items
            .filter((item) => item.currency === currency)
            .reduce((sum, item) => sum + item.ourQuantity * item.unitPrice, 0),
        0,
      );
      const moneyGross = drops.reduce(
        (sessionTotal, session) =>
          sessionTotal +
          session.money
            .filter((money) => money.currency === currency)
            .reduce((sum, money) => sum + money.ourAmount, 0),
        0,
      );
      const costs = expenses
        .filter((expense) => expense.currency === currency)
        .reduce(
          (sum, expense) =>
            sum +
            (expense.quantity * expense.unitPrice * expense.ourShareBasisPoints) / 10_000,
          0,
        );
      const gross = itemGross + moneyGross;
      return { currency, gross, itemGross, moneyGross, costs, net: gross - costs };
    });
    return { scope: 'private' as const, runCount: drops.length, totals };
  }
}
