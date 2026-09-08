export type TeamEconomySplitMode = 'max_equal' | 'strict_equal';

export interface TeamEconomySplitResult {
  readonly perPile: number;
  readonly distributed: number;
  readonly leftover: number;
}

export function suggestedOwnedQuantity(totalQuantity: number, ourShareBasisPoints: number): number {
  if (!Number.isInteger(totalQuantity) || totalQuantity < 0) throw new Error('invalid total quantity');
  if (!Number.isInteger(ourShareBasisPoints) || ourShareBasisPoints < 0 || ourShareBasisPoints > 10_000) {
    throw new Error('invalid ownership share');
  }
  return Math.floor((totalQuantity * ourShareBasisPoints) / 10_000);
}

export function splitOwnedQuantity(
  ourQuantity: number,
  pileCount: number,
  mode: TeamEconomySplitMode,
): TeamEconomySplitResult {
  if (!Number.isInteger(ourQuantity) || ourQuantity < 0) throw new Error('invalid owned quantity');
  if (!Number.isInteger(pileCount) || pileCount < 1 || pileCount > 100) throw new Error('invalid pile count');

  if (mode === 'strict_equal' && ourQuantity % pileCount !== 0) {
    return { perPile: 0, distributed: 0, leftover: ourQuantity };
  }

  const perPile = Math.floor(ourQuantity / pileCount);
  const distributed = perPile * pileCount;
  return { perPile, distributed, leftover: ourQuantity - distributed };
}

export function attributedAmount(amount: number, shareBasisPoints: number): number {
  if (!Number.isFinite(amount) || amount < 0) throw new Error('invalid amount');
  if (!Number.isInteger(shareBasisPoints) || shareBasisPoints < 0 || shareBasisPoints > 10_000) {
    throw new Error('invalid ownership share');
  }
  return (amount * shareBasisPoints) / 10_000;
}
