import { describe, expect, it, vi } from 'vitest';

import type { ActivityTx, LfgCharacterVerifyPort } from '../ports/activity.ports.js';
import { searchLfgMatches } from './lfg.use-cases.js';

const CHAR_ID = '11111111-1111-4111-8111-111111111111';
const END = new Date('2026-08-22T22:00:00.000Z');

function characterVerifyStub(): LfgCharacterVerifyPort {
  return {
    resolveCharacter: (input) =>
      Promise.resolve({
        characterId: input.characterId,
        classSpecKey: 'priest_buff',
        classSpecLabel: 'priest_buff',
        supportedPartyRoles: ['BUFF', 'FLEX'],
        sessionRoles: ['BUFF'],
      }),
  };
}

describe('LFG batch query paths', () => {
  it('searchLfgMatches loads match context in three batched queries', async () => {
    const batchRoleCalls = vi.fn().mockResolvedValue(new Map());
    const batchFilledCalls = vi.fn().mockResolvedValue(new Map());
    const batchOccupiedCalls = vi.fn().mockResolvedValue(new Map());
    const singleRoleCalls = vi.fn();
    const activities = [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        guildId: 'g1',
        organizationId: 'o1',
        typeId: 'type-1',
        name: 'Run 1',
        description: '',
        startAt: new Date('2026-08-22T18:00:00.000Z'),
        endAt: null,
        status: 'published' as const,
        enrollmentOpen: true,
        participantLimit: 8,
        participantMode: 'shared' as const,
        seriesId: null,
        seriesOccurrenceIndex: null,
        visibility: 'public' as const,
        privateInviteTokenHash: null,
        privateRoleIds: [],
        organizerDiscordUserId: 'org1',
        organizerV2UserId: null,
        coOrganizerDiscordUserId: null,
        coOrganizerV2UserId: null,
        publicationChannelId: 'ch1',
        timezone: 'Europe/Warsaw',
        locationText: null,
        cancelReason: null,
        cancelledAt: null,
        version: 1,
        scheduledFinishAt: END,
        opaqueId: 'aaaaaaaaaaaa',
        createdAt: END,
        updatedAt: END,
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        guildId: 'g1',
        organizationId: 'o1',
        typeId: 'type-1',
        name: 'Run 2',
        description: '',
        startAt: new Date('2026-08-22T19:00:00.000Z'),
        endAt: null,
        status: 'published' as const,
        enrollmentOpen: true,
        participantLimit: 8,
        participantMode: 'shared' as const,
        seriesId: null,
        seriesOccurrenceIndex: null,
        visibility: 'public' as const,
        privateInviteTokenHash: null,
        privateRoleIds: [],
        organizerDiscordUserId: 'org1',
        organizerV2UserId: null,
        coOrganizerDiscordUserId: null,
        coOrganizerV2UserId: null,
        publicationChannelId: 'ch1',
        timezone: 'Europe/Warsaw',
        locationText: null,
        cancelReason: null,
        cancelledAt: null,
        version: 1,
        scheduledFinishAt: END,
        opaqueId: 'bbbbbbbbbbbb',
        createdAt: END,
        updatedAt: END,
      },
    ];
    batchRoleCalls.mockResolvedValue(
      new Map(
        activities.map((activity) => [
          activity.id,
          [
            { role: 'TANK' as const, requiredCount: 1 },
            { role: 'BUFF' as const, requiredCount: 1 },
            { role: 'DPS' as const, requiredCount: 4 },
          ],
        ]),
      ),
    );
    batchFilledCalls.mockResolvedValue(
      new Map(activities.map((activity) => [activity.id, { TANK: 1, DPS: 3 }])),
    );
    batchOccupiedCalls.mockResolvedValue(new Map(activities.map((activity) => [activity.id, 4])));

    const tx = {
      listOpenActivitiesForLfg: () => Promise.resolve(activities),
      listActivityRoleRequirementsForActivities: batchRoleCalls,
      countParticipationsByPartyRoleForActivities: batchFilledCalls,
      countOccupiedParticipationsForActivities: batchOccupiedCalls,
      listActivityRoleRequirements: singleRoleCalls,
      getSettings: () => Promise.resolve({ guildId: 'g1', orgId: 'o1' }),
    } as unknown as ActivityTx;

    await searchLfgMatches(
      tx,
      { discordUserId: 'seeker' },
      {
        guildId: 'g1',
        organizationId: 'o1',
        activityTypeKey: 'azrael',
        characterId: CHAR_ID,
        sessionRoles: ['BUFF'],
        windowStartAt: new Date('2026-08-22T16:00:00.000Z'),
        windowEndAt: END,
      },
      characterVerifyStub(),
    );

    expect(batchRoleCalls).toHaveBeenCalledTimes(1);
    expect(batchFilledCalls).toHaveBeenCalledTimes(1);
    expect(batchOccupiedCalls).toHaveBeenCalledTimes(1);
    expect(singleRoleCalls).not.toHaveBeenCalled();
  });
});
