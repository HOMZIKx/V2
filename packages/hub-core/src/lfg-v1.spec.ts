import { describe, expect, it } from 'vitest';

import {
  buildLfgMatchFingerprint,
  deriveIntentExpiresAt,
  formatLfgMatchReason,
  formatLfgRoleNeedSummary,
} from './lfg-v1.js';

describe('lfg-v1 helpers', () => {
  it('buildLfgMatchFingerprint is stable for role ordering', () => {
    const input = {
      activityId: 'a1',
      activityVersion: 2,
      startAtIso: '2026-08-22T10:00:00.000Z',
      occupied: 3,
      capacity: 8,
      roleNeeds: [
        { role: 'DPS' as const, requiredCount: 4 },
        { role: 'TANK' as const, requiredCount: 1 },
      ],
      filledByRole: { DPS: 2, TANK: 1 },
    };
    const a = buildLfgMatchFingerprint(input);
    const b = buildLfgMatchFingerprint({
      ...input,
      roleNeeds: [
        { role: 'TANK' as const, requiredCount: 1 },
        { role: 'DPS' as const, requiredCount: 4 },
      ],
      filledByRole: { TANK: 1, DPS: 2 },
    });
    expect(a).toBe(b);
    expect(a).toContain('a1|2|');
  });

  it('formatLfgRoleNeedSummary lists open roles', () => {
    const summary = formatLfgRoleNeedSummary(
      [
        { role: 'TANK', requiredCount: 1 },
        { role: 'BUFF', requiredCount: 1, preferred: true },
      ],
      { TANK: 1, BUFF: 0 },
    );
    expect(summary).toContain('Buff');
  });

  it('formatLfgMatchReason prefers exact role label', () => {
    expect(formatLfgMatchReason(['exact_role', 'eligible'])).toBe('Twoja rola pasuje');
  });

  it('deriveIntentExpiresAt caps at 24h and minimum 30m', () => {
    const now = new Date('2026-08-22T10:00:00.000Z');
    const farWindow = new Date('2026-08-30T10:00:00.000Z');
    const capped = deriveIntentExpiresAt(farWindow, now);
    expect(capped.getTime()).toBe(now.getTime() + 24 * 3_600_000);

    const nearWindow = new Date('2026-08-22T10:10:00.000Z');
    const minTtl = deriveIntentExpiresAt(nearWindow, now);
    expect(minTtl.getTime()).toBe(now.getTime() + 30 * 60_000);
  });
});
