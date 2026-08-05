import { describe, expect, it } from 'vitest';

import { IdentityError, isIdentityError } from './errors.js';

describe('IdentityError', () => {
  it('carries a stable code and defaults message to the code', () => {
    const error = new IdentityError('UNAUTHENTICATED');
    expect(error.code).toBe('UNAUTHENTICATED');
    expect(error.message).toBe('UNAUTHENTICATED');
    expect(error.name).toBe('IdentityError');
  });

  it('keeps a custom message', () => {
    const error = new IdentityError('VALIDATION_FAILED', 'bad input');
    expect(error.message).toBe('bad input');
  });

  it('is detectable via the type guard', () => {
    expect(isIdentityError(new IdentityError('NOT_FOUND'))).toBe(true);
    expect(isIdentityError(new Error('other'))).toBe(false);
    expect(isIdentityError(null)).toBe(false);
  });
});
