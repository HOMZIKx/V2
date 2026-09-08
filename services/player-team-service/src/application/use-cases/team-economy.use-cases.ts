import { type PlayerTeamStateUseCases } from './player-team-state.use-cases.js';
import { PlayerTeamError } from '../../domain/errors.js';
import {
  type EconomyCatalogSeedItem,
  type EconomyCurrency,
  type EconomyDropSessionInput,
  type EconomyExpenseInput,
  type TeamEconomyRepositoryPort,
} from '../../domain/ports/team-economy.port.js';

function memberRole(state: Record<string, unknown>, viewerId: string): 'owner' | 'member' | null {
  const members = Array.isArray(state.members) ? state.members : [];
  for (const raw of members) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const member = raw as Record<string, unknown>;
    if (member.discordAccountId !== viewerId) continue;
    return member.role === 'owner' ? 'owner' : member.role === 'member' ? 'member' : null;
  }
  return null;
}

export class TeamEconomyUseCases {
  public constructor(
    private readonly repository: TeamEconomyRepositoryPort,
    private readonly stateUseCases: PlayerTeamStateUseCases,
  ) {}

  private async workspace(viewerId: string, workspaceId: string) {
    return this.stateUseCases.getWorkspaceSnapshot(viewerId, workspaceId);
  }

  private async assertOwner(viewerId: string, workspaceId: string): Promise<void> {
    const workspace = await this.workspace(viewerId, workspaceId);
    if (memberRole(workspace.state, viewerId) !== 'owner') {
      throw new PlayerTeamError(
        'UNAUTHORIZED',
        'only workspace owner can edit an existing global item catalogue entry',
      );
    }
  }

  public async catalogStatus(viewerId: string, workspaceId: string) {
    await this.workspace(viewerId, workspaceId);
    return this.repository.catalogStatus();
  }

  public async importItems(
    viewerId: string,
    workspaceId: string,
    items: readonly EconomyCatalogSeedItem[],
  ) {
    await this.workspace(viewerId, workspaceId);
    return this.repository.importItems({ items, createdBy: viewerId });
  }

  public async searchItems(viewerId: string, workspaceId: string, query: string) {
    await this.workspace(viewerId, workspaceId);
    return this.repository.searchItems(workspaceId, query);
  }

  public async createItem(
    viewerId: string,
    workspaceId: string,
    input: {
      canonicalName: string;
      category: string;
      imageUrl?: string | null;
      alias?: string | null;
    },
  ) {
    await this.workspace(viewerId, workspaceId);
    return this.repository.createItem({ ...input, createdBy: viewerId });
  }

  public async updateItem(
    viewerId: string,
    workspaceId: string,
    input: {
      itemId: string;
      canonicalName?: string;
      category?: string;
      imageUrl?: string | null;
      alias?: string | null;
    },
  ) {
    await this.assertOwner(viewerId, workspaceId);
    return this.repository.updateItem({ ...input, updatedBy: viewerId });
  }

  public async addPrice(
    viewerId: string,
    workspaceId: string,
    input: { itemId: string; unitPrice: number; currency: EconomyCurrency },
  ) {
    await this.workspace(viewerId, workspaceId);
    await this.repository.addPrice({ workspaceId, ...input, createdBy: viewerId });
    return { ok: true } as const;
  }

  public async createDrop(
    viewerId: string,
    input: Omit<EconomyDropSessionInput, 'createdBy'>,
  ) {
    await this.workspace(viewerId, input.workspaceId);
    return this.repository.createDrop({ ...input, createdBy: viewerId });
  }

  public async listDrops(viewerId: string, workspaceId: string, sinceIso?: string) {
    await this.workspace(viewerId, workspaceId);
    return this.repository.listDrops(workspaceId, sinceIso);
  }

  public async createExpense(
    viewerId: string,
    input: Omit<EconomyExpenseInput, 'createdBy'>,
  ) {
    await this.workspace(viewerId, input.workspaceId);
    return this.repository.createExpense({ ...input, createdBy: viewerId });
  }

  public async listExpenses(viewerId: string, workspaceId: string, sinceIso?: string) {
    await this.workspace(viewerId, workspaceId);
    return this.repository.listExpenses(workspaceId, sinceIso);
  }

  public async summary(viewerId: string, workspaceId: string, sinceIso?: string) {
    await this.workspace(viewerId, workspaceId);
    const [drops, expenses] = await Promise.all([
      this.repository.listDrops(workspaceId, sinceIso),
      this.repository.listExpenses(workspaceId, sinceIso),
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
    return { workspaceId, runCount: drops.length, totals };
  }
}
