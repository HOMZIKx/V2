/**
 * Marketplace offer matching — Stage 7 (BUY/SELL watches).
 */

export type MarketplaceOffer = {
  readonly side: 'BUY' | 'SELL';
  readonly categoryKey: string;
  readonly itemLabel: string;
  readonly priceAmount: number | null;
  readonly budgetAmount: number | null;
  readonly status: 'open' | 'matched' | 'fulfilled' | 'cancelled' | 'expired';
};

export type MarketplaceWatch = {
  readonly side?: 'BUY' | 'SELL';
  readonly categoryKey?: string;
  readonly itemQuery?: string;
  readonly maxPrice?: number | null;
  readonly minBudget?: number | null;
};

export function offerMatchesWatch(offer: MarketplaceOffer, watch: MarketplaceWatch): boolean {
  if (offer.status !== 'open') {
    return false;
  }
  if (watch.side !== undefined && watch.side !== offer.side) {
    return false;
  }
  if (watch.categoryKey !== undefined && watch.categoryKey !== offer.categoryKey) {
    return false;
  }
  if (
    watch.itemQuery !== undefined &&
    watch.itemQuery.trim().length > 0 &&
    !offer.itemLabel.toLowerCase().includes(watch.itemQuery.trim().toLowerCase())
  ) {
    return false;
  }
  if (
    watch.maxPrice !== undefined &&
    watch.maxPrice !== null &&
    offer.side === 'SELL' &&
    offer.priceAmount !== null &&
    offer.priceAmount > watch.maxPrice
  ) {
    return false;
  }
  if (
    watch.minBudget !== undefined &&
    watch.minBudget !== null &&
    offer.side === 'BUY' &&
    offer.budgetAmount !== null &&
    offer.budgetAmount < watch.minBudget
  ) {
    return false;
  }
  return true;
}
