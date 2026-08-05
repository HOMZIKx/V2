import { describe, expect, it } from 'vitest';

import { toWebHeaders } from './request-headers.js';

describe('toWebHeaders', () => {
  it('copies scalar headers', () => {
    const headers = toWebHeaders({ cookie: 'a=1', 'content-type': 'application/json' });
    expect(headers.get('cookie')).toBe('a=1');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('appends array-valued headers and skips undefined', () => {
    const headers = toWebHeaders({ 'set-cookie': ['a=1', 'b=2'], 'x-missing': undefined });
    expect(headers.get('set-cookie')).toContain('a=1');
    expect(headers.get('set-cookie')).toContain('b=2');
    expect(headers.has('x-missing')).toBe(false);
  });
});
