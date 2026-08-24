import { describe, expect, it } from 'vitest';

import {
  LfgSearchRequestLegacyDriftSchema,
  LfgSearchRequestSchema,
  LfgSearchResponseSchema,
} from '@v2/contracts';

/**
 * Ensures activity-service controller schemas stay aligned with shared transport contracts.
 * Consumer fixtures below mirror web/discord request builders after drift remediation.
 */
describe('activity-service LFG transport contract alignment', () => {
  const canonicalSearch = {
    guildId: '222222222222222222',
    organizationId: '33333333-3333-4333-8333-333333333333',
    activityTypeKey: 'azrael',
    characterId: '11111111-1111-4111-8111-111111111111',
    sessionRoles: ['TANK', 'DPS'] as const,
    windowStartAt: '2026-08-22T10:00:00.000Z',
    windowEndAt: '2026-08-22T12:00:00.000Z',
  };

  it('accepts web/discord canonical search payload', () => {
    expect(LfgSearchRequestSchema.safeParse(canonicalSearch).success).toBe(true);
  });

  it('rejects pre-remediation drift payload still present in legacy tests', () => {
    const legacy = {
      ...canonicalSearch,
      characterClassSpecKey: 'warrior_body',
      characterSupportedRoles: ['TANK'],
    };
    delete (legacy as { characterId?: string }).characterId;
    expect(LfgSearchRequestSchema.safeParse(legacy).success).toBe(false);
    expect(LfgSearchRequestLegacyDriftSchema.safeParse(legacy).success).toBe(true);
  });

  it('accepts search response shape returned by lfg.use-cases', () => {
    expect(
      LfgSearchResponseSchema.safeParse({
        matches: [
          {
            activityId: '11111111-1111-4111-8111-111111111111',
            opaqueId: 'opaque-1',
            occupancy: { occupied: 3, capacity: 5 },
            roleNeedSummary: 'Brakuje: TANK',
            matchReason: 'Role match',
            eligiblePartyRoles: ['TANK'],
            suggestedPartyRole: 'TANK',
          },
        ],
      }).success,
    ).toBe(true);
  });
});
