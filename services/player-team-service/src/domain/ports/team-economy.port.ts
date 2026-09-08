import type { TeamEconomySplitMode } from '../team-economy.js';

export type EconomyCurrency = 'yang' | 'won' | 'gem';

export interface EconomyCatalogItem {
  readonly id: string;
  readonly canonicalName: string;
  readonly category: string;
  readonly imageUrl: string | null;
  readonly lastPrice: { readonly unitPrice: number; readonly currency: EconomyCurrency; readonly createdAtIso: string } | null;
}

export interface EconomyDropItemInput {
  readonly itemId: string | null;
  readonly displayName: string;
  readonly totalQuantity: number;
  readonly ourQuantity: number;
  readonly unitPrice: number;
  readonly currency: EconomyCurrency;
  readonly aiConfidence?: number | null;
}

export interface EconomyParticipantInput {
  readonly participantId: string;
  readonly displayName: string;
  readonly isTeamMember: boolean;
}

export interface EconomyDropSessionInput {
  readonly workspaceId: string;
  readonly source: string;
  readonly occurredAtIso: string;
  readonly notes?: string | null;
  readonly screenshotRef?: string | null;
  readonly ourShareBasisPoints: number;
  readonly pileCount: number;
  readonly splitMode: TeamEconomySplitMode;
  readonly createdBy: string;
  readonly participants: readonly EconomyParticipantInput[];
  readonly items: readonly EconomyDropItemInput[];
}

export interface EconomyDropItemRecord extends EconomyDropItemInput {
  readonly id: string;
  readonly perPile: number;
  readonly leftover: number;
}

export interface EconomyDropSessionRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly source: string;
  readonly occurredAtIso: string;
  readonly notes: string | null;
  readonly ourShareBasisPoints: number;
  readonly pileCount: number;
  readonly splitMode: TeamEconomySplitMode;
  readonly createdBy: string;
  readonly items: readonly EconomyDropItemRecord[];
  readonly participants: readonly EconomyParticipantInput[];
}

export interface EconomyExpenseInput {
  readonly workspaceId: string;
  readonly dropSessionId?: string | null;
  readonly label: string;
  readonly expenseType: 'item' | 'yang' | 'gem' | 'other';
  readonly quantity: number;
  readonly unitPrice: number;
  readonly currency: EconomyCurrency;
  readonly ourShareBasisPoints: number;
  readonly occurredAtIso: string;
  readonly createdBy: string;
}

export interface EconomyExpenseRecord extends EconomyExpenseInput { readonly id: string; }

export interface TeamEconomyRepositoryPort {
  searchItems(workspaceId: string, query: string): Promise<readonly EconomyCatalogItem[]>;
  createItem(input: { canonicalName: string; category: string; imageUrl?: string | null; alias?: string | null; createdBy: string }): Promise<EconomyCatalogItem>;
  updateItem(input: { itemId: string; canonicalName?: string; category?: string; imageUrl?: string | null; alias?: string | null; updatedBy: string }): Promise<EconomyCatalogItem>;
  addPrice(input: { workspaceId: string; itemId: string; unitPrice: number; currency: EconomyCurrency; createdBy: string }): Promise<void>;
  createDrop(input: EconomyDropSessionInput): Promise<EconomyDropSessionRecord>;
  listDrops(workspaceId: string, sinceIso?: string): Promise<readonly EconomyDropSessionRecord[]>;
  createExpense(input: EconomyExpenseInput): Promise<EconomyExpenseRecord>;
  listExpenses(workspaceId: string, sinceIso?: string): Promise<readonly EconomyExpenseRecord[]>;
}
