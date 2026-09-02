/**
 * Dungeon LFG v1 helpers — Issue #20 Owner-Accepted.
 */

import { DEFAULT_INTEREST_CATALOG } from './catalogs/interests.js';
import { DEFAULT_PARTY_ROLE_CATALOG, type PartyRoleKey } from './catalogs/party-role.js';
import type { LfgRoleNeed } from './lfg-matching.js';

/** Dungeon LFG activity types (Issue #20: Azrael + Smok for v1). */
export const LFG_DUNGEON_ACTIVITY_TYPES = DEFAULT_INTEREST_CATALOG.filter(
  (entry) => entry.enabled && (entry.key === 'azrael' || entry.key === 'smok'),
);

function partyRolePlayerLabel(role: PartyRoleKey): string {
  return DEFAULT_PARTY_ROLE_CATALOG.find((entry) => entry.key === role)?.label ?? role;
}

export type LfgMatchFingerprintInput = {
  readonly activityId: string;
  readonly activityVersion: number;
  readonly startAtIso: string;
  readonly occupied: number;
  readonly capacity: number;
  readonly roleNeeds: readonly LfgRoleNeed[];
  readonly filledByRole: Readonly<Partial<Record<PartyRoleKey, number>>>;
};

export function buildLfgMatchFingerprint(input: LfgMatchFingerprintInput): string {
  const needs = [...input.roleNeeds]
    .sort((a, b) => a.role.localeCompare(b.role))
    .map((n) => `${n.role}:${n.requiredCount}:${n.preferred === true ? 'p' : 'r'}`)
    .join(',');
  const filled = Object.entries(input.filledByRole)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([role, count]) => `${role}:${count ?? 0}`)
    .join(',');
  return [
    input.activityId,
    String(input.activityVersion),
    input.startAtIso,
    `${input.occupied}/${input.capacity}`,
    needs,
    filled,
  ].join('|');
}

export function formatLfgRoleNeedSummary(
  roleNeeds: readonly LfgRoleNeed[],
  filledByRole: Readonly<Partial<Record<PartyRoleKey, number>>>,
): string {
  const open = roleNeeds
    .map((need) => {
      const filled = filledByRole[need.role] ?? 0;
      const missing = Math.max(0, need.requiredCount - filled);
      return missing > 0 ? `${missing} × ${partyRolePlayerLabel(need.role)}` : null;
    })
    .filter((line): line is string => line !== null);
  if (open.length === 0) {
    return 'Wolne miejsca';
  }
  return `Potrzeba: ${open.join(' + ')}`;
}

export function formatLfgMatchReason(reasons: readonly string[]): string {
  const labels: Record<string, string> = {
    eligible: 'Pasujesz do składu',
    exact_role: 'Twoja rola pasuje',
    preferred_role: 'Preferowana rola',
    flex_capacity: 'Możesz zagrać dowolną rolą',
  };
  for (const reason of reasons) {
    const label = labels[reason];
    if (label !== undefined) {
      return label;
    }
  }
  return 'Dopasowanie czasu i dungeonu';
}

export function deriveIntentExpiresAt(windowEndAt: Date, now: Date): Date {
  const safetyCapMs = 24 * 3_600_000;
  const fromWindow = windowEndAt.getTime();
  const capped = Math.min(fromWindow, now.getTime() + safetyCapMs);
  return new Date(Math.max(capped, now.getTime() + 30 * 60_000));
}
