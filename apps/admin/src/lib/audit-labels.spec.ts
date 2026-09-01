import { describe, expect, it } from 'vitest';

import { formatAuditAction, formatAuditWhen } from './audit-labels.js';

describe('audit labels', () => {
  it('formats known actions in owner language', () => {
    expect(formatAuditAction('activity.hub.published')).toContain('opublikował');
  });

  it('formats audit timestamps for pl-PL', () => {
    const formatted = formatAuditWhen('2026-08-20T18:00:00.000Z');
    expect(formatted.length).toBeGreaterThan(5);
  });
});
