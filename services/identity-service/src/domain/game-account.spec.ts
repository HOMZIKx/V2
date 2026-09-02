import { describe, expect, it } from 'vitest';

import {
  assertValidGameAccountDisplayName,
  DEFAULT_GAME_ACCOUNT_DISPLAY_NAME,
} from './game-account.js';

describe('game-account domain', () => {
  it('validates display names', () => {
    expect(assertValidGameAccountDisplayName('  MAIN  ')).toBe('MAIN');
    expect(() => assertValidGameAccountDisplayName('')).toThrow();
    expect(() => assertValidGameAccountDisplayName('x'.repeat(65))).toThrow();
  });

  it('uses Polish default account label for migration', () => {
    expect(DEFAULT_GAME_ACCOUNT_DISPLAY_NAME).toBe('Moje konto');
  });
});
