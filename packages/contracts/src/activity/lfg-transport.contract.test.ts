import { describe, expect, it } from 'vitest';

import {
  LfgSearchRequestLegacyDriftSchema,
  LfgSearchRequestSchema,
  LfgSearchResponseSchema,
  LfgWatchCreateRequestSchema,
} from './lfg-transport.js';

const CHARACTER_ID = '11111111-1111-4111-8111-111111111111';
const GUILD_ID = '222222222222222222';
const ORG_ID = '33333333-3333-4333-8333-333333333333';

describe('LFG transport contracts', () => {
  it('accepts canonical search body with characterId (web/discord target shape)', () => {
    const parsed = LfgSearchRequestSchema.safeParse({
      guildId: GUILD_ID,
      organizationId: ORG_ID,
      activityTypeKey: 'azrael',
      characterId: CHARACTER_ID,
      sessionRoles: ['TANK', 'DPS'],
      windowStartAt: '2026-08-22T10:00:00.000Z',
      windowEndAt: '2026-08-22T12:00:00.000Z',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects legacy drift body that sent class-spec fields instead of characterId', () => {
    const legacy = {
      guildId: GUILD_ID,
      organizationId: ORG_ID,
      activityTypeKey: 'azrael',
      characterClassSpecKey: 'warrior_body',
      characterSupportedRoles: ['TANK'],
      sessionRoles: ['TANK'],
      windowStartAt: '2026-08-22T10:00:00.000Z',
      windowEndAt: '2026-08-22T12:00:00.000Z',
    };
    expect(LfgSearchRequestSchema.safeParse(legacy).success).toBe(false);
    expect(LfgSearchRequestLegacyDriftSchema.safeParse(legacy).success).toBe(true);
  });

  it('accepts server search response occupancy object (discord client must not expect string)', () => {
    const parsed = LfgSearchResponseSchema.safeParse({
      matches: [
        {
          activityId: '11111111-1111-4111-8111-111111111111',
          opaqueId: 'opaque-1',
          occupancy: { occupied: 3, capacity: 5 },
          roleNeedSummary: 'Brakuje: TANK',
          matchReason: 'Role match',
          eligiblePartyRoles: ['TANK', 'DPS'],
          suggestedPartyRole: 'TANK',
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects occupancy encoded as string (discord drift regression)', () => {
    const parsed = LfgSearchResponseSchema.safeParse({
      matches: [
        {
          activityId: '11111111-1111-4111-8111-111111111111',
          occupancy: '3/5',
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects inverted search time windows', () => {
    expect(
      LfgSearchRequestSchema.safeParse({
        guildId: GUILD_ID,
        organizationId: ORG_ID,
        activityTypeKey: 'azrael',
        characterId: CHARACTER_ID,
        sessionRoles: ['TANK'],
        windowStartAt: '2026-08-22T12:00:00.000Z',
        windowEndAt: '2026-08-22T10:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('accepts watch create and rejects inverted watch windows', () => {
    const valid = {
      guildId: GUILD_ID,
      organizationId: ORG_ID,
      characterId: CHARACTER_ID,
      activityTypeKey: 'azrael',
      sessionRoles: ['TANK'] as const,
      windowStartAt: '2026-08-22T10:00:00.000Z',
      windowEndAt: '2026-08-22T12:00:00.000Z',
    };
    expect(LfgWatchCreateRequestSchema.safeParse(valid).success).toBe(true);
    expect(
      LfgWatchCreateRequestSchema.safeParse({
        ...valid,
        windowStartAt: '2026-08-22T12:00:00.000Z',
        windowEndAt: '2026-08-22T10:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});
