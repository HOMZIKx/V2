import { describe, expect, it } from 'vitest';

import { ACTIVITY_PERMISSIONS } from './permissions.js';

/**
 * Frozen copy of docs/architecture/CENTRUM_AKTYWNOSCI.md §6 (P4-D7 Accepted).
 * Do not invent aliases (e.g. activity.admin).
 */
const ACCEPTED_ACTIVITY_PERMISSION_IDS = Object.freeze([
  'permission.activity.event.read',
  'permission.activity.event.create',
  'permission.activity.event.join',
  'permission.activity.event.manage.self',
  'permission.activity.event.manage.guild',
  'permission.activity.event.create.recurring',
  'permission.activity.event.publish.multi_guild',
  'permission.activity.event.create.private',
  'permission.activity.panel.manage',
  'permission.activity.config.manage',
  'permission.activity.attendance.record',
  'permission.activity.stats.read.self',
  'permission.activity.stats.read.guild',
  'permission.activity.report.manage',
] as const);

describe('ACTIVITY_PERMISSIONS catalog', () => {
  const values = Object.values(ACTIVITY_PERMISSIONS);

  it('every value matches permission.activity.* prefix', () => {
    for (const value of values) {
      expect(value).toMatch(/^permission\.activity\./);
    }
  });

  it('every value is listed in ACCEPTED_ACTIVITY_PERMISSION_IDS from CENTRUM_AKTYWNOSCI §6', () => {
    const accepted = new Set<string>(ACCEPTED_ACTIVITY_PERMISSION_IDS);
    for (const value of values) {
      expect(accepted.has(value)).toBe(true);
    }
    expect(new Set(values).size).toBe(ACCEPTED_ACTIVITY_PERMISSION_IDS.length);
  });

  it('does not expose aliases like activity.admin', () => {
    for (const value of values) {
      expect(value.startsWith('activity.')).toBe(false);
      expect(value).not.toContain('activity.admin');
      expect(value).not.toBe('activity.admin');
    }
    expect(values).not.toContain('edit.self');
    expect(values).not.toContain('admin.configure');
  });
});
