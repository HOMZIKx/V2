import { describe, expect, it } from 'vitest';

import {
  assertValidClassSpecKey,
  assertValidPartyRoles,
  classSpecDoesNotImplyPartyRole,
  resolveClassSpecLabel,
} from './player-profile.js';

describe('player-profile domain', () => {
  it('resolves class/spec labels from catalog', () => {
    expect(resolveClassSpecLabel('warrior_body')).toBe('Wojownik Ciało');
    expect(() => assertValidClassSpecKey('not-a-class')).toThrow(/Unknown/);
  });

  it('allows multiple party roles independent of class/spec', () => {
    expect(assertValidPartyRoles(['DPS', 'TANK'])).toEqual(['DPS', 'TANK']);
    expect(classSpecDoesNotImplyPartyRole()).toBe(true);
  });
});
