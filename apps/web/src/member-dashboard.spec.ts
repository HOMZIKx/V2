import { describe, expect, it } from 'vitest';

import {
  emptyMemberDashboardFixture,
  getMemberDashboardSummary,
  memberDashboardFixture,
} from './member-dashboard.js';

describe('member dashboard view model', () => {
  it('summarizes account access without deriving character or equipment data', () => {
    expect(getMemberDashboardSummary(memberDashboardFixture)).toEqual({
      workspaceCount: 1,
      pendingInvitationCount: 0,
      unreadNoticeCount: 1,
      availableModuleCount: 4,
    });
  });

  it('treats a user without teams or characters as a valid account state', () => {
    expect(getMemberDashboardSummary(emptyMemberDashboardFixture)).toEqual({
      workspaceCount: 0,
      pendingInvitationCount: 0,
      unreadNoticeCount: 0,
      availableModuleCount: 2,
    });
  });

  it('keeps timer access independent from team and character access', () => {
    const timersModule = memberDashboardFixture.modules.find((module) => module.id === 'timers');
    const charactersModule = memberDashboardFixture.modules.find(
      (module) => module.id === 'characters',
    );

    expect(timersModule?.href).toBe('/timers');
    expect(timersModule?.description).toContain('Bossy i metiny');
    expect(charactersModule?.description).toContain('jeśli masz do niego dostęp');
  });
});
