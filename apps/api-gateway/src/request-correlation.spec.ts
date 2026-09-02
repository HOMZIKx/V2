import { describe, expect, it } from 'vitest';

import { applyRequestCorrelation } from './request-correlation.js';

describe('applyRequestCorrelation', () => {
  it('generates and echoes correlation ids when missing', () => {
    const headers: Record<string, string | string[] | undefined> = {};
    const outgoing: Record<string, string> = {};
    applyRequestCorrelation({ headers }, { header: (key, value) => (outgoing[key] = value) });
    expect(headers['x-correlation-id']).toEqual(outgoing['x-correlation-id']);
    expect(headers['x-request-id']).toEqual(outgoing['x-request-id']);
    expect(String(headers['x-correlation-id'])).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('preserves inbound correlation ids', () => {
    const headers: Record<string, string | string[] | undefined> = {
      'x-correlation-id': 'corr-keep',
      'x-request-id': 'req-keep',
    };
    const outgoing: Record<string, string> = {};
    applyRequestCorrelation({ headers }, { header: (key, value) => (outgoing[key] = value) });
    expect(outgoing['x-correlation-id']).toBe('corr-keep');
    expect(outgoing['x-request-id']).toBe('req-keep');
  });
});
