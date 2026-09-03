import { describe, expect, it } from 'vitest';

import {
  applyQuickActionOutcome,
  getDashboardSummary,
  memberDashboardFixture,
} from './member-dashboard.js';

describe('member dashboard view model', () => {
  it('summarizes only actionable and fully prepared team data', () => {
    expect(getDashboardSummary(memberDashboardFixture)).toEqual({
      readyActions: 2,
      onlineMembers: 2,
      readyEquipmentSets: 1,
      totalCharacters: 3,
    });
  });

  it('records a human-confirmed outcome without changing the other actions', () => {
    const updated = applyQuickActionOutcome(
      memberDashboardFixture.quickActions,
      'horse-medal-aalpsik',
      'done',
    );

    expect(updated[0]).toMatchObject({ status: 'done', dueLabel: 'Zrobione' });
    expect(updated[1]).toBe(memberDashboardFixture.quickActions[1]);
    expect(memberDashboardFixture.quickActions[0]?.status).toBe('ready');
  });

  it.each([
    ['snoozed', 'Przypomnij później'],
    ['unavailable', 'Nie mogę wykonać'],
  ] as const)('maps the %s outcome to an explicit team-visible label', (outcome, label) => {
    const updated = applyQuickActionOutcome(
      memberDashboardFixture.quickActions,
      'war-set-nerwnicht',
      outcome,
    );

    expect(updated[2]).toMatchObject({ status: outcome, dueLabel: label });
  });
});
