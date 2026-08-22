import { describe, expect, it, vi } from 'vitest';

import type { ActivityRecord, ActivityTx } from '../ports/activity.ports.js';
import {
  createLfgIntent,
  joinLfgActivity,
  notifyLfgIntentsForActivity,
  searchLfgMatches,
  suppressLfgMatch,
} from './lfg.use-cases.js';
import * as notificationUseCases from './notification.use-cases.js';

const START = new Date('2026-08-22T18:00:00.000Z');
const END = new Date('2026-08-22T22:00:00.000Z');
const NOW = new Date('2026-08-22T12:00:00.000Z');
const CHAR_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function baseActivity(overrides: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    guildId: 'g1',
    organizationId: 'o1',
    typeId: 'type-azrael',
    name: 'Azrael run',
    description: '',
    startAt: START,
    endAt: null,
    scheduleKind: 'exact',
    periodKey: null,
    scheduleHasExplicitTime: true,
    status: 'registrations_open',
    enrollmentOpen: true,
    participantLimit: 8,
    participantMode: 'shared',
    seriesId: null,
    seriesOccurrenceIndex: null,
    visibility: 'public',
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
    opaqueId: 'opaque1',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeTx(overrides: Partial<ActivityTx> = {}): ActivityTx {
  const activities = [
    baseActivity(),
    baseActivity({
      id: '22222222-2222-4222-8222-222222222222',
      startAt: new Date('2026-08-22T19:00:00.000Z'),
    }),
  ];
  const base = {
    listOpenActivitiesForLfg: () => Promise.resolve(activities),
    listActivityRoleRequirements: () =>
      Promise.resolve([
        { role: 'TANK' as const, requiredCount: 1 },
        { role: 'BUFF' as const, requiredCount: 1 },
        { role: 'DPS' as const, requiredCount: 4 },
      ]),
    countParticipationsByPartyRole: () => Promise.resolve({ TANK: 1, DPS: 3 }),
    countOccupiedParticipations: () => Promise.resolve(4),
    hasOverlappingLfgIntent: () => Promise.resolve(false),
    insertLfgIntent: () => Promise.resolve('intent-1'),
    getActivity: (id: string) => Promise.resolve(activities.find((a) => a.id === id) ?? null),
    getActivityTypeKeyByTypeId: () => Promise.resolve('azrael'),
    getLfgIntentById: () =>
      Promise.resolve({
        id: 'intent-1',
        guildId: 'g1',
        organizationId: 'o1',
        recipientDiscordUserId: 'u1',
        characterId: CHAR_ID,
        activityTypeKey: 'azrael',
        sessionRoles: ['BUFF'],
        windowStartAt: new Date('2026-08-22T16:00:00.000Z'),
        windowEndAt: END,
        expiresAt: END,
        cancelledAt: null,
        pausedAt: null,
        fulfilledAt: null,
        classSpecKey: 'priest_buff',
      }),
    recordLfgIntentSuppression: () => Promise.resolve(),
    recordLfgActorMatchSuppression: () => Promise.resolve(),
    isLfgIntentSuppressed: () => Promise.resolve(false),
    isLfgActorMatchSuppressed: () => Promise.resolve(false),
    listActiveLfgIntents: () =>
      Promise.resolve([
        {
          id: 'intent-1',
          recipientDiscordUserId: 'u1',
          sessionRoles: ['BUFF'],
          characterId: CHAR_ID,
          classSpecKey: 'priest_buff',
          windowStartAt: new Date('2026-08-22T16:00:00.000Z'),
          windowEndAt: END,
        },
      ]),
    hasLfgNotifiedMatch: () => Promise.resolve(false),
    recordLfgNotifiedMatch: () => Promise.resolve(),
  };
  return { ...base, ...overrides } as ActivityTx;
}

describe('searchLfgMatches', () => {
  it('ranks existing better match first when role need is open', async () => {
    const tx = makeTx({
      countParticipationsByPartyRole: () => Promise.resolve({ TANK: 1, BUFF: 0, DPS: 3 }),
    });
    const result = await searchLfgMatches(
      tx,
      { discordUserId: 'seeker' },
      {
        guildId: 'g1',
        organizationId: 'o1',
        activityTypeKey: 'azrael',
        characterClassSpecKey: 'priest_buff',
        characterSupportedRoles: ['BUFF', 'DPS'],
        sessionRoles: ['BUFF'],
        windowStartAt: new Date('2026-08-22T16:00:00.000Z'),
        windowEndAt: END,
      },
    );
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0]?.matchReason).toContain('rola');
    expect(result.matches[0]?.roleNeedSummary).toContain('BUFF');
    expect(result.matches[0]?.occupancy).toEqual({ occupied: 4, capacity: 8 });
  });

  it('hides private activities from non-invited members', async () => {
    const tx = makeTx({
      listOpenActivitiesForLfg: () =>
        Promise.resolve([
          baseActivity({
            visibility: 'private',
            privateRoleIds: ['role-vip'],
            organizerDiscordUserId: 'org1',
          }),
        ]),
    });
    const result = await searchLfgMatches(
      tx,
      { discordUserId: 'outsider' },
      {
        guildId: 'g1',
        organizationId: 'o1',
        activityTypeKey: 'azrael',
        characterClassSpecKey: 'priest_buff',
        characterSupportedRoles: ['BUFF'],
        sessionRoles: ['BUFF'],
        windowStartAt: new Date('2026-08-22T16:00:00.000Z'),
        windowEndAt: END,
        memberRoleIds: [],
      },
    );
    expect(result.matches).toHaveLength(0);
  });

  it('excludes groups when role needs appear filled via countParticipationsByPartyRole', async () => {
    const tx = makeTx({
      countParticipationsByPartyRole: () => Promise.resolve({ TANK: 1, BUFF: 1, DPS: 4 }),
    });
    const result = await searchLfgMatches(
      tx,
      { discordUserId: 'seeker' },
      {
        guildId: 'g1',
        organizationId: 'o1',
        activityTypeKey: 'azrael',
        characterClassSpecKey: 'priest_buff',
        characterSupportedRoles: ['BUFF'],
        sessionRoles: ['BUFF'],
        windowStartAt: new Date('2026-08-22T16:00:00.000Z'),
        windowEndAt: END,
      },
    );
    expect(result.matches).toHaveLength(0);
  });
});

describe('createLfgIntent', () => {
  it('rejects duplicate overlapping watches', async () => {
    const tx = makeTx({ hasOverlappingLfgIntent: () => Promise.resolve(true) });
    await expect(
      createLfgIntent(
        tx,
        { discordUserId: 'u1' },
        {
          guildId: 'g1',
          organizationId: 'o1',
          characterId: CHAR_ID,
          activityTypeKey: 'azrael',
          sessionRoles: ['DPS'],
          windowStartAt: new Date('2026-08-22T16:00:00.000Z'),
          windowEndAt: END,
        },
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('creates intent when no overlap', async () => {
    const insert = vi.fn(() => Promise.resolve('intent-new'));
    const tx = makeTx({ insertLfgIntent: insert });
    const result = await createLfgIntent(
      tx,
      { discordUserId: 'u1' },
      {
        guildId: 'g1',
        organizationId: 'o1',
        characterId: CHAR_ID,
        activityTypeKey: 'azrael',
        sessionRoles: ['DPS'],
        windowStartAt: new Date('2026-08-22T16:00:00.000Z'),
        windowEndAt: END,
      },
      NOW,
    );
    expect(result.intentId).toBe('intent-new');
    expect(insert).toHaveBeenCalledOnce();
  });
});

describe('suppressLfgMatch', () => {
  it('records suppression fingerprint for Nie teraz', async () => {
    const record = vi.fn(() => Promise.resolve());
    const tx = makeTx({
      recordLfgIntentSuppression: record,
    });
    await suppressLfgMatch(
      tx,
      { discordUserId: 'u1' },
      { activityId: '11111111-1111-4111-8111-111111111111', intentId: 'intent-1' },
      NOW,
    );
    expect(record).toHaveBeenCalledOnce();
  });
});

describe('notifyLfgIntentsForActivity', () => {
  it('wires enqueueUserNotification for eligible intent', async () => {
    const enqueue = vi.spyOn(notificationUseCases, 'enqueueUserNotification').mockResolvedValue({
      created: true,
      suppressed: false,
      inboxItemId: 'inbox-1',
    });
    const tx = makeTx();
    const sent = await notifyLfgIntentsForActivity(tx, baseActivity(), 'azrael', NOW);
    expect(sent).toBe(1);
    expect(enqueue).toHaveBeenCalledOnce();
    enqueue.mockRestore();
  });

  it('skips notify when intent is suppressed', async () => {
    const enqueue = vi.spyOn(notificationUseCases, 'enqueueUserNotification');
    const tx = makeTx({ isLfgIntentSuppressed: () => Promise.resolve(true) });
    const sent = await notifyLfgIntentsForActivity(tx, baseActivity(), 'azrael', NOW);
    expect(sent).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
    enqueue.mockRestore();
  });

  it('returns zero when no active intents match', async () => {
    const tx = makeTx({ listActiveLfgIntents: () => Promise.resolve([]) });
    const sent = await notifyLfgIntentsForActivity(tx, baseActivity(), 'azrael', NOW);
    expect(sent).toBe(0);
  });
});

describe('suppressLfgMatch without intent', () => {
  it('records actor-level suppression for Nie teraz', async () => {
    const record = vi.fn(() => Promise.resolve());
    const tx = makeTx({ recordLfgActorMatchSuppression: record });
    await suppressLfgMatch(
      tx,
      { discordUserId: 'u1' },
      { activityId: '11111111-1111-4111-8111-111111111111' },
      NOW,
    );
    expect(record).toHaveBeenCalledOnce();
  });
});

describe('createLfgIntent validation', () => {
  it('rejects invalid character id', async () => {
    const tx = makeTx();
    await expect(
      createLfgIntent(
        tx,
        { discordUserId: 'u1' },
        {
          guildId: 'g1',
          organizationId: 'o1',
          characterId: 'not-a-uuid',
          activityTypeKey: 'azrael',
          sessionRoles: ['DPS'],
          windowStartAt: new Date('2026-08-22T16:00:00.000Z'),
          windowEndAt: END,
        },
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('joinLfgActivity', () => {
  it('rejects join when selected role slot is already filled', async () => {
    const tx = makeTx({
      lockActivity: async () => Promise.resolve(baseActivity()),
      listPublicationTargets: () => Promise.resolve([]),
      getStatusDef: () =>
        Promise.resolve({
          id: 'status-1',
          guildId: 'g1',
          label: 'Confirmed',
          occupiesSlot: true,
          behavior: 'confirmed',
          selectableByMember: true,
          active: true,
          sortOrder: 0,
          seedKey: 'confirmed',
        }),
      listParticipations: () => Promise.resolve([]),
      countParticipationsByPartyRole: () => Promise.resolve({ TANK: 1, BUFF: 1, DPS: 4 }),
    });
    await expect(
      joinLfgActivity(
        tx,
        { discordUserId: 'seeker' },
        {
          activityId: '11111111-1111-4111-8111-111111111111',
          statusDefId: 'status-1',
          partyRoleKey: 'BUFF',
          guildId: 'g1',
          characterSupportedRoles: ['BUFF'],
          sessionRoles: ['BUFF'],
        },
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});
