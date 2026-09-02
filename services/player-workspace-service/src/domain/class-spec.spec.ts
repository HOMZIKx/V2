import { describe, expect, it } from 'vitest';

import { assertValidClassSpecKey, resolveClassSpecLabel } from './class-spec.js';
import { PlayerWorkspaceError } from './errors.js';

describe('class-spec', () => {
  it('accepts enabled hub-core keys', () => {
    expect(() => assertValidClassSpecKey('warrior_body')).not.toThrow();
    expect(resolveClassSpecLabel('warrior_body')).toContain('Wojownik');
  });

  it('rejects disabled or unknown keys', () => {
    expect(() => assertValidClassSpecKey('lycan')).toThrow(PlayerWorkspaceError);
    expect(() => assertValidClassSpecKey('warrior')).toThrow(PlayerWorkspaceError);
  });
});
