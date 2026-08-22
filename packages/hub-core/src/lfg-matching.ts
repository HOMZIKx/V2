/**
 * LFG matching pure domain — FOUNDATION WIP (Issue #20 direction partial).
 * Do not invent remaining user-facing behavior.
 * See docs/ai/LFG_SCOPE_LOCK.md and docs/ai/OWNER_DISCOVERY_GAPS.md.
 */

import { type PartyRoleKey, isPartyRoleKey } from './catalogs/party-role.js';

export type LfgRoleNeed = {
  readonly role: PartyRoleKey;
  readonly requiredCount: number;
  readonly preferred?: boolean;
};

export type LfgGroupMatchInput = {
  readonly activityTypeKey: string;
  readonly guildId: string;
  readonly organizationId: string;
  readonly capacity: number;
  readonly occupied: number;
  readonly status: 'open' | 'full' | 'cancelled' | 'ended' | 'active';
  readonly startAtMs: number;
  readonly roleNeeds: readonly LfgRoleNeed[];
  readonly filledByRole: Readonly<Partial<Record<PartyRoleKey, number>>>;
  readonly classSpecRestrictions?: readonly string[];
};

export type LfgSeekerInput = {
  readonly guildId: string;
  readonly organizationId: string;
  readonly activityTypeKey: string;
  readonly characterClassSpecKey: string;
  readonly characterSupportedRoles: readonly PartyRoleKey[];
  readonly sessionRoles: readonly PartyRoleKey[];
  readonly windowStartMs: number;
  readonly windowEndMs: number;
  readonly membershipOk: boolean;
};

export type LfgMatchRank = {
  readonly score: number;
  readonly reasons: readonly string[];
  readonly eligible: boolean;
};

export function normalizeSessionRoles(
  supported: readonly PartyRoleKey[],
  session: readonly string[],
): readonly PartyRoleKey[] {
  const chosen = session.filter(isPartyRoleKey).filter((role) => supported.includes(role));
  return chosen.length > 0 ? chosen : supported;
}

export function rankLfgMatch(group: LfgGroupMatchInput, seeker: LfgSeekerInput): LfgMatchRank {
  const reasons: string[] = [];
  if (!seeker.membershipOk) {
    return { score: 0, reasons: ['membership_lost'], eligible: false };
  }
  if (group.guildId !== seeker.guildId || group.organizationId !== seeker.organizationId) {
    return { score: 0, reasons: ['guild_or_org_mismatch'], eligible: false };
  }
  if (group.activityTypeKey !== seeker.activityTypeKey) {
    return { score: 0, reasons: ['activity_mismatch'], eligible: false };
  }
  if (group.status === 'cancelled' || group.status === 'ended') {
    return { score: 0, reasons: ['group_inactive'], eligible: false };
  }
  if (group.status === 'full' || group.occupied >= group.capacity) {
    return { score: 0, reasons: ['group_full'], eligible: false };
  }
  if (group.startAtMs < seeker.windowStartMs || group.startAtMs > seeker.windowEndMs) {
    return { score: 0, reasons: ['time_mismatch'], eligible: false };
  }
  if (
    group.classSpecRestrictions !== undefined &&
    group.classSpecRestrictions.length > 0 &&
    !group.classSpecRestrictions.includes(seeker.characterClassSpecKey)
  ) {
    return { score: 0, reasons: ['class_spec_restricted'], eligible: false };
  }

  const sessionRoles = normalizeSessionRoles(seeker.characterSupportedRoles, seeker.sessionRoles);
  const openNeeds = group.roleNeeds.filter((need) => {
    const filled = group.filledByRole[need.role] ?? 0;
    return filled < need.requiredCount;
  });

  if (openNeeds.length === 0 && group.roleNeeds.length > 0) {
    // Composition filled — only ANY/FLEX overflow if capacity remains
    const flexOk = sessionRoles.includes('FLEX');
    if (!flexOk) {
      return { score: 0, reasons: ['role_needs_filled'], eligible: false };
    }
    reasons.push('flex_capacity');
  }

  const matchingNeeds = openNeeds.filter((need) => sessionRoles.includes(need.role));
  if (group.roleNeeds.length > 0 && matchingNeeds.length === 0 && !sessionRoles.includes('FLEX')) {
    return { score: 0, reasons: ['role_mismatch'], eligible: false };
  }

  let score = 50;
  score += Math.max(0, group.capacity - group.occupied) * 2;
  score += matchingNeeds.length * 15;
  if (matchingNeeds.some((need) => need.preferred === true)) {
    score += 5;
    reasons.push('preferred_role');
  }
  if (matchingNeeds.length > 0) {
    reasons.push('exact_role');
  }
  reasons.push('eligible');
  return { score, reasons, eligible: true };
}

export type LfgIntent = {
  readonly userDiscordId: string;
  readonly characterId: string;
  readonly activityTypeKey: string;
  readonly sessionRoles: readonly PartyRoleKey[];
  readonly windowStartMs: number;
  readonly windowEndMs: number;
  readonly expiresAtMs: number;
  readonly cancelledAtMs: number | null;
  readonly guildId: string;
  readonly organizationId: string;
};

export function isLfgIntentActive(intent: LfgIntent, nowMs: number): boolean {
  return intent.cancelledAtMs === null && intent.expiresAtMs > nowMs;
}
