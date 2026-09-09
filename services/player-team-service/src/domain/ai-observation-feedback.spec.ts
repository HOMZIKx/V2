import { describe, expect, it } from 'vitest';

import { evaluateEconomyFeedback, evaluateEquipmentFeedback } from './ai-observation-feedback.js';

describe('AI observation feedback', () => {
  it('marks unchanged equipment output as accepted', () => {
    expect(
      evaluateEquipmentFeedback(
        { name: 'Zatruty Miecz', enhancement: 9, category: 'weapon', bonuses: ['Siła +12'] },
        { name: ' Zatruty  Miecz ', enhancement: 9, category: 'weapon', bonuses: ['Siła +12'] },
      ),
    ).toEqual({ status: 'accepted', changedFields: [] });
  });

  it('reports corrected equipment fields', () => {
    expect(
      evaluateEquipmentFeedback(
        { name: 'Zatruty Miecz', enhancement: 8, category: 'weapon', bonuses: ['Siła +10'] },
        { name: 'Zatruty Miecz', enhancement: 9, category: 'weapon', bonuses: ['Siła +12'] },
      ),
    ).toEqual({ status: 'corrected', changedFields: ['enhancement', 'bonuses'] });
  });

  it('records user-entered bonuses when AI missed every bonus line', () => {
    expect(
      evaluateEquipmentFeedback(
        { name: 'Ebonitowe Kolczyki', enhancement: 9, category: 'earrings', bonuses: [] },
        { name: 'Ebonitowe Kolczyki', enhancement: 9, category: 'earrings', bonuses: ['Silny przeciwko Ludziom +10%'] },
      ),
    ).toEqual({ status: 'corrected', changedFields: ['bonuses'] });
  });

  it('compares normalized economy recognition with the saved drop', () => {
    expect(
      evaluateEconomyFeedback(
        {
          normalizedItems: [
            {
              recognizedName: 'Agat',
              quantity: 12,
              catalogMatch: { name: 'Agat' },
            },
          ],
        },
        { items: [{ name: 'agat', quantity: 14 }] },
      ),
    ).toEqual({ status: 'corrected', changedFields: ['items.0.quantity'] });
  });
});
