import { describe, expect, it } from 'vitest';

import { fromClassSpecKey, toClassSpecKey } from './class-spec-adapter';

describe('class-spec adapter', () => {
  it('maps presentation class+gender to canonical classSpecKey', () => {
    expect(toClassSpecKey('warrior', 'male')).toBe('warrior_body');
    expect(toClassSpecKey('warrior', 'female')).toBe('warrior_mental');
    expect(toClassSpecKey('ninja', 'male')).toBe('ninja_blade');
    expect(toClassSpecKey('ninja', 'female')).toBe('ninja_dagger');
    expect(toClassSpecKey('sura', 'male')).toBe('sura_weapon');
    expect(toClassSpecKey('sura', 'female')).toBe('sura_magic');
    expect(toClassSpecKey('shaman', 'male')).toBe('shaman_dragon');
    expect(toClassSpecKey('shaman', 'female')).toBe('shaman_heal');
  });

  it('maps canonical classSpecKey back to presentation without a third enum', () => {
    expect(fromClassSpecKey('sura_weapon')).toEqual({ characterClass: 'sura', gender: 'male' });
    expect(fromClassSpecKey('shaman_heal')).toEqual({ characterClass: 'shaman', gender: 'female' });
  });
});
