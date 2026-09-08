import type { TeamEconomySplitMode } from '../team-economy.js';

export type EconomyCurrency = 'yang' | 'won' | 'gem';

export interface EconomyCatalogItem {
  readonly id: string;
  readonly canonicalName: string;
  readonly category: string;
  readonly imageUrl: string | null;
  readonly lastPrice: {
    readonly unitPrice: number;
    readonly currency: EconomyCurrency;
    readonly createdAtIso: string;
  } | null;
}

export interface EconomyCatalogSeedItem {
  readonly id: string;
  readonly canonicalName: string;
  readonly category: string;
  readonly imageUrl?: string | null;
  readonly aliases?: readonly string[];
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

export interface EconomyDropMoneyInput {
  readonly currency: EconomyCurrency;
  readonly totalAmount: number;
  readonly ourShareBasisPoints: number;
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
  /** Suggested ownership share for items; final ownership is stored as integer ourQuantity per item. */
  readonly ourShareBasisPoints: number;
  readonly pileCount: number;
  readonly splitMode: TeamEconomySplitMode;
  readonly createdBy: string;
  readonly participants: readonly EconomyParticipantInput[];
  readonly items: readonly EconomyDropItemInput[];
  /** Direct currency drops. These are attributed percentage-wise, never rounded to item counts. */
  readonly money: readonly EconomyDropMoneyInput[];
}

export interface EconomyDropItemRecord extends EconomyDropItemInput {
  readonly id: string;
  readonly perPile: number;
  readonly leftover: number;
}

export interface EconomyDropMoneyRecord extends EconomyDropMoneyInput {
  readonly id: string;
  readonly ourAmount: number;
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
  readonly money: readonly EconomyDropMoneyRecord[];
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

export interface EconomyExpenseRecord extends EconomyExpenseInput {
  readonly id: string;
}

export interface TeamEconomyRepositoryPort {
  searchItems(workspaceId: string, query: string): Promise<readonly EconomyCatalogItem[]>;
  catalogStatus(): Promise<{ readonly total: number }>;
  importItems(input: {
    readonly items: readonly EconomyCatalogSeedItem[];
    readonly createdBy: string;
  }): Promise<{ readonly imported: number; readonly total: number }>;
  createItem(input: {
    canonicalName: string;
    category: string;
    imageUrl?: string | null;
    alias?: string | null;
    createdBy: string;
  }): Promise<EconomyCatalogItem>;
  updateItem(input: {
    itemId: string;
    canonicalName?: string;
    category?: string;
    imageUrl?: string | null;
    alias?: string | null;
    updatedBy: string;
  }): Promise<EconomyCatalogItem>;
  addPrice(input: {
    workspaceId: string;
    itemId: string;
    unitPrice: number;
    currency: EconomyCurrency;
    createdBy: string;
  }): Promise<void>;
  createDrop(input: EconomyDropSessionInput): Promise<EconomyDropSessionRecord>;
  listDrops(workspaceId: string, sinceIso?: string): Promise<readonly EconomyDropSessionRecord[]>;
  createExpense(input: EconomyExpenseInput): Promise<EconomyExpenseRecord>;
  listExpenses(workspaceId: string, sinceIso?: string): Promise<readonly EconomyExpenseRecord[]>;
}
