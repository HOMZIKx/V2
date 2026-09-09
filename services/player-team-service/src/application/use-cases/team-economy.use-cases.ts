import { createHash } from 'node:crypto';

import { type PlayerTeamStateUseCases } from './player-team-state.use-cases.js';
import { PlayerTeamError } from '../../domain/errors.js';
import {
  type EconomyCatalogSeedItem,
  type EconomyCurrency,
  type EconomyDropSessionInput,
  type EconomyExpenseInput,
  type TeamEconomyRepositoryPort,
} from '../../domain/ports/team-economy.port.js';

export const PRIVATE_ECONOMY_WORKSPACE_ALIAS = 'private';

function privateEconomyWorkspaceId(viewerId: string): string {
  const digest = createHash('sha256')
    .update(`destiled:private-economy:${viewerId.trim()}`)
    .digest('hex')
    .slice(0, 40);
  return `private-economy-${digest}`;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function viewerAppId(state: Record<string, unknown> | null): string | null {
  if (!state) return null;
  const viewer = state.viewer;
  if (!viewer || typeof viewer !== 'object' || Array.isArray(viewer)) return null;
  return asString((viewer as Record<string, unknown>).id);
}

function memberRole(
  state: Record<string, unknown>,
  viewerId: string,
  viewerInternalId: string | null,
): 'owner' | 'member' | null {
  const members = Array.isArray(state.members) ? state.members : [];
  for (const raw of members) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const member = raw as Record<string, unknown>;
    const matchesViewer =
      asString(member.discordAccountId) === viewerId ||
      (viewerInternalId !== null && asString(member.id) === viewerInternalId);
    if (!matchesViewer) continue;
    return member.role === 'owner' ? 'owner' : member.role === 'member' ? 'member' : null;
  }
  return null;
}

export class TeamEconomyUseCases {
  public constructor(
    private readonly repository: TeamEconomyRepositoryPort,
    private readonly stateUseCases: PlayerTeamStateUseCases,
  ) {}

  /**
   * `private` is a reserved route alias. The actual storage key is derived on
   * the server from the authenticated Discord identity, so the browser never
   * selects another member's private economy workspace.
   */
  private async workspaceId(viewerId: string, workspaceId: string): Promise<string> {
    if (workspaceId === PRIVATE_ECONOMY_WORKSPACE_ALIAS) {
      return privateEconomyWorkspaceId(viewerId);
    }
    await this.stateUseCases.getWorkspaceSnapshot(viewerId, workspaceId);
    return workspaceId;
  }

  private async assertCatalogCreateAccess(viewerId: string, workspaceId: string): Promise<void> {
    if (workspaceId === PRIVATE_ECONOMY_WORKSPACE_ALIAS) {
      throw new PlayerTeamError(
        'UNAUTHORIZED',
        'private economy cannot mutate the shared global item catalogue',
      );
    }
    await this.stateUseCases.getWorkspaceSnapshot(viewerId, workspaceId);
  }

  private async assertOwner(viewerId: string, workspaceId: string): Promise<string> {
    if (workspaceId === PRIVATE_ECONOMY_WORKSPACE_ALIAS) {
      throw new PlayerTeamError(
        'UNAUTHORIZED',
        'private economy cannot edit an existing global item catalogue entry',
      );
    }
    const [workspace, viewerSnapshot] = await Promise.all([
      this.stateUseCases.getWorkspaceSnapshot(viewerId, workspaceId),
      this.stateUseCases.getViewerSnapshot(viewerId),
    ]);
    if (
      memberRole(workspace.state, viewerId, viewerAppId(viewerSnapshot?.state ?? null)) !== 'owner'
    ) {
      throw new PlayerTeamError(
        'UNAUTHORIZED',
        'only workspace owner can edit an existing global item catalogue entry',
      );
    }
    return workspaceId;
  }

  public async catalogStatus(viewerId: string, workspaceId: string) {
    await this.workspaceId(viewerId, workspaceId);
    return this.repository.catalogStatus();
  }

  public async importItems(
    viewerId: string,
    workspaceId: string,
    items: readonly EconomyCatalogSeedItem[],
  ) {
    await this.assertCatalogCreateAccess(viewerId, workspaceId);
    return this.repository.importItems({ items, createdBy: viewerId });
  }

  public async searchItems(viewerId: string, workspaceId: string, query: string) {
    const resolvedWorkspaceId = await this.workspaceId(viewerId, workspaceId);
    return this.repository.searchItems(resolvedWorkspaceId, query);
  }

  public async createItem(
    viewerId: string,
    workspaceId: string,
    input: {
      canonicalName: string;
      category: string;
      imageUrl?: string | null | undefined;
      alias?: string | null | undefined;
    },
  ) {
    await this.assertCatalogCreateAccess(viewerId, workspaceId);
    return this.repository.createItem({ ...input, createdBy: viewerId });
  }

  public async updateItem(
    viewerId: string,
    workspaceId: string,
    input: {
      itemId: string;
      canonicalName?: string | undefined;
      category?: string | undefined;
      imageUrl?: string | null | undefined;
      alias?: string | null | undefined;
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
    const resolvedWorkspaceId = await this.workspaceId(viewerId, workspaceId);
    await this.repository.addPrice({
      workspaceId: resolvedWorkspaceId,
      ...input,
      createdBy: viewerId,
    });
    return { ok: true } as const;
  }

  public async createDrop(
    viewerId: string,
    input: Omit<EconomyDropSessionInput, 'createdBy'>,
  ) {
    const resolvedWorkspaceId = await this.workspaceId(viewerId, input.workspaceId);
    return this.repository.createDrop({
      ...input,
      workspaceId: resolvedWorkspaceId,
      createdBy: viewerId,
    });
  }

  public async listDrops(viewerId: string, workspaceId: string, sinceIso?: string) {
    const resolvedWorkspaceId = await this.workspaceId(viewerId, workspaceId);
    return this.repository.listDrops(resolvedWorkspaceId, sinceIso);
  }

  public async createExpense(
    viewerId: string,
    input: Omit<EconomyExpenseInput, 'createdBy'>,
  ) {
    const resolvedWorkspaceId = await this.workspaceId(viewerId, input.workspaceId);
    return this.repository.createExpense({
      ...input,
      workspaceId: resolvedWorkspaceId,
      createdBy: viewerId,
    });
  }

  public async listExpenses(viewerId: string, workspaceId: string, sinceIso?: string) {
    const resolvedWorkspaceId = await this.workspaceId(viewerId, workspaceId);
    return this.repository.listExpenses(resolvedWorkspaceId, sinceIso);
  }

  public async summary(viewerId: string, workspaceId: string, sinceIso?: string) {
    const resolvedWorkspaceId = await this.workspaceId(viewerId, workspaceId);
    const [drops, expenses] = await Promise.all([
      this.repository.listDrops(resolvedWorkspaceId, sinceIso),
      this.repository.listExpenses(resolvedWorkspaceId, sinceIso),
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
