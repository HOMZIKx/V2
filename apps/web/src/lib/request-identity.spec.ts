import { describe, expect, it } from 'vitest';

import { createRequestIdentity } from './request-identity';

describe('createRequestIdentity', () => {
  it('marks previous guild/session requests stale after next()', () => {
    const identity = createRequestIdentity();
    const first = identity.next();
    expect(first.isCurrent()).toBe(true);
    const second = identity.next();
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
  });

  it('invalidate drops in-flight identity on logout', () => {
    const identity = createRequestIdentity();
    const pending = identity.next();
    identity.invalidate();
    expect(pending.isCurrent()).toBe(false);
    expect(pending.signal.aborted).toBe(true);
  });
});
