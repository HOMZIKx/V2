import { describe, expect, it, vi } from 'vitest';

import { ActivityError } from '../../domain/errors.js';
import type {
  ActivityRecord,
  ActivityTx,
  AuthorizePort,
  LfgCharacterVerifyPort,
  VerifiedLfgCharacter,
} from '../ports/activity.ports.js';
import {
  createLfgFullGroupWatch,
  createLfgIntent,
  joinLfgActivity,
  notifyLfgIntentsForActivity,
  searchLfgMatches,
  suppressLfgMatch,
  updateLfgIntent,
} from './lfg.use-cases.js';
import * as notificationUseCases from './notification.use-cases.js';

const START = new Date('2026-08-22T18:00:00.000Z');
const END = new Date('2026-08-22T22:00:00.000Z');
const NOW = new Date('2026-08-22T12:00:00.000Z');
const CHAR_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CHARACTER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CHARACTER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UNKNOWN_CHAR_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function characterVerifyStub(
  overrides: Partial<Record<string, VerifiedShape>> = {},
): LfgCharacterVerifyPort {
  const defaults: Record<string, VerifiedShape> = {
    [CHAR_ID]: {
      classSpecKey: 'priest_buff',
      supportedPartyRoles: ['BUFF', 'DPS'],
    },
  };
  const table = { ...defaults, ...overrides };
  return {
    resolveCharacter: (input) => {
      const row = table[input.characterId];
      if (row === undefined) {
        return Promise.reject(new ActivityError('NOT_FOUND', 'Character not found for user'));
      }
      const session = input.sessionRoles.filter((role) =>
        row.supportedPartyRoles.includes(role as 'TANK' | 'BUFF' | 'DPS' | 'FLEX'),
      );
      if (session.length === 0) {
        return Promise.reject(
          new ActivityError('VALIDATION_FAILED', 'Session role is not supported by character'),
        );
      }
      return Promise.resolve({
        characterId: input.characterId,
        classSpecKey: row.classSpecKey,
        classSpecLabel: row.classSpecKey,
        supportedPartyRoles: row.supportedPartyRoles,
        sessionRoles: session as VerifiedLfgCharacter['sessionRoles'],
      });
    },
  };
}

type VerifiedShape = {
  classSpecKey: string;
  supportedPartyRoles: Array<'TANK' | 'BUFF' | 'DPS' | 'FLEX'>;
};

const allowAuthorize: AuthorizePort = {
  authorize: () => Promise.resolve({ allowed: true, permissionId: 'join', decision: 'allow' }),
};

const denyAuthorize: AuthorizePort = {
  authorize: () => Promise.resolve({ allowed: false, permissionId: 'join', decision: 'deny' }),
};

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
    opaqueId: 'aaaaaaaaaaaa',
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
    updateLfgIntent: () => Promise.resolve(true),
    clearLfgIntentSuppressions: () => Promise.resolve(),
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
          id: '33333333-3333-4333-8333-333333333333',
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
        characterId: CHAR_ID,
        sessionRoles: ['BUFF'],
        windowStartAt: new Date('2026-08-22T16:00:00.000Z'),
        windowEndAt: END,
      },
      characterVerifyStub(),
    );
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0]?.matchReason).toContain('rola');
    expect(result.matches[0]?.roleNeedSummary).toContain('BUFF');
    expect(result.matches[0]?.eligiblePartyRoles).toContain('BUFF');
    expect(result.matches[0]?.suggestedPartyRole).toBe('BUFF');
  });

  it('rejects foreign character id', async () => {
    const tx = makeTx();
    await expect(
      searchLfgMatches(
        tx,
        { discordUserId: 'seeker' },
        {
          guildId: 'g1',
          organizationId: 'o1',
          activityTypeKey: 'azrael',
          characterId: UNKNOWN_CHAR_ID,
          sessionRoles: ['BUFF'],
          windowStartAt: new Date('2026-08-22T16:00:00.000Z'),
          windowEndAt: END,
        },
        characterVerifyStub(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects fake uuid character id', async () => {
    const tx = makeTx();
    await expect(
      searchLfgMatches(
        tx,
        { discordUserId: 'seeker' },
        {
          guildId: 'g1',
          organizationId: 'o1',
          activityTypeKey: 'azrael',
          characterId: 'not-a-uuid',
          sessionRoles: ['BUFF'],
          windowStartAt: new Date('2026-08-22T16:00:00.000Z'),
          windowEndAt: END,
        },
        characterVerifyStub(),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects session role not supported by character', async () => {
    const tx = makeTx();
    await expect(
      searchLfgMatches(
        tx,
        { discordUserId: 'seeker' },
        {
          guildId: 'g1',
          organizationId: 'o1',
          activityTypeKey: 'azrael',
          characterId: CHAR_ID,
          sessionRoles: ['TANK'],
          windowStartAt: new Date('2026-08-22T16:00:00.000Z'),
          windowEndAt: END,
        },
        characterVerifyStub(),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
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
        characterId: CHAR_ID,
        sessionRoles: ['BUFF'],
        windowStartAt: new Date('2026-08-22T16:00:00.000Z'),
        windowEndAt: END,
        memberRoleIds: [],
      },
      characterVerifyStub(),
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
        characterId: CHAR_ID,
        sessionRoles: ['BUFF'],
        windowStartAt: new Date('2026-08-22T16:00:00.000Z'),
        windowEndAt: END,
      },
      characterVerifyStub(),
    );
    expect(result.matches).toHaveLength(0);
  });

  it('returns TANK+DPS eligible roles for multi-role session', async () => {
    const tx = makeTx({
      countParticipationsByPartyRole: () => Promise.resolve({ TANK: 1, BUFF: 1, DPS: 2 }),
    });
    const result = await searchLfgMatches(
      tx,
      { discordUserId: 'seeker' },
      {
        guildId: 'g1',
        organizationId: 'o1',
        activityTypeKey: 'azrael',
        characterId: CHAR_ID,
        sessionRoles: ['BUFF', 'DPS'],
        windowStartAt: new Date('2026-08-22T16:00:00.000Z'),
        windowEndAt: END,
      },
      characterVerifyStub({
        [CHAR_ID]: { classSpecKey: 'priest_buff', supportedPartyRoles: ['BUFF', 'DPS'] },
      }),
    );
    expect(result.matches[0]?.eligiblePartyRoles).toEqual(['DPS']);
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
        characterVerifyStub({
          [CHAR_ID]: { classSpecKey: 'mage_dps', supportedPartyRoles: ['DPS'] },
        }),
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
      characterVerifyStub({
        [CHAR_ID]: { classSpecKey: 'mage_dps', supportedPartyRoles: ['DPS'] },
      }),
      NOW,
    );
    expect(result.intentId).toBe('intent-new');
    expect(insert).toHaveBeenCalledOnce();
  });
});

describe('updateLfgIntent', () => {
  it('clears suppressions after edit', async () => {
    const clear = vi.fn(() => Promise.resolve());
    const tx = makeTx({ clearLfgIntentSuppressions: clear });
    await updateLfgIntent(
      tx,
      { discordUserId: 'u1' },
      {
        intentId: 'intent-1',
        guildId: 'g1',
        sessionRoles: ['BUFF'],
        windowStartAt: new Date('2026-08-22T16:00:00.000Z'),
        windowEndAt: END,
      },
      characterVerifyStub(),
      NOW,
    );
    expect(clear).toHaveBeenCalledWith('intent-1');
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
        characterVerifyStub(),
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('joinLfgActivity', () => {
  function joinTx(overrides: Partial<ActivityTx> = {}): ActivityTx {
    return makeTx({
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
      upsertParticipation: () =>
        Promise.resolve({
          id: 'part-1',
          activityId: '11111111-1111-4111-8111-111111111111',
          discordUserId: 'seeker',
          v2UserId: null,
          statusDefId: 'status-1',
          confirmationState: 'confirmed',
          reconfirmDeadline: null,
          waitlistPosition: null,
          resignedAt: null,
          removedAt: null,
          removeReason: null,
          occupiesSlot: true,
          statusBehavior: 'confirmed',
          partyRoleKey: 'BUFF',
          scopeGuildId: null,
        }),
      ...overrides,
    });
  }

  it('rejects join when selected role slot is already filled', async () => {
    const tx = joinTx({
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
          characterId: CHAR_ID,
        },
        characterVerifyStub(),
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('rejects forged party role not supported by character', async () => {
    const tx = joinTx({
      countParticipationsByPartyRole: () => Promise.resolve({ TANK: 1, BUFF: 0, DPS: 3 }),
    });
    await expect(
      joinLfgActivity(
        tx,
        { discordUserId: 'seeker' },
        {
          activityId: '11111111-1111-4111-8111-111111111111',
          statusDefId: 'status-1',
          partyRoleKey: 'TANK',
          guildId: 'g1',
          characterId: CHAR_ID,
        },
        characterVerifyStub(),
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('allows multi-role join when DPS slot is open', async () => {
    const upsert = vi.fn(() =>
      Promise.resolve({
        id: 'part-1',
        activityId: '11111111-1111-4111-8111-111111111111',
        discordUserId: 'seeker',
        v2UserId: null,
        statusDefId: 'status-1',
        confirmationState: 'confirmed' as const,
        reconfirmDeadline: null,
        waitlistPosition: null,
        resignedAt: null,
        removedAt: null,
        removeReason: null,
        occupiesSlot: true,
        statusBehavior: 'confirmed' as const,
        partyRoleKey: 'DPS',
        scopeGuildId: null,
      }),
    );
    const tx = joinTx({
      countParticipationsByPartyRole: () => Promise.resolve({ TANK: 1, BUFF: 1, DPS: 2 }),
      upsertParticipation: upsert,
    });
    await joinLfgActivity(
      tx,
      { discordUserId: 'seeker' },
      {
        activityId: '11111111-1111-4111-8111-111111111111',
        statusDefId: 'status-1',
        partyRoleKey: 'DPS',
        guildId: 'g1',
        characterId: CHAR_ID,
      },
      characterVerifyStub({
        [CHAR_ID]: { classSpecKey: 'priest_buff', supportedPartyRoles: ['BUFF', 'DPS'] },
      }),
      NOW,
    );
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ partyRoleKey: 'DPS' }));
  });

  it('uses intent characterId and ignores forged client characterId (CHARACTER_A vs CHARACTER_B)', async () => {
    const resolveCharacter = vi.fn(
      (input: { characterId: string; sessionRoles: readonly string[] }) => {
        if (input.characterId !== CHARACTER_B) {
          return Promise.reject(new ActivityError('NOT_FOUND', 'Character not found for user'));
        }
        return Promise.resolve({
          characterId: CHARACTER_B,
          classSpecKey: 'priest_buff',
          classSpecLabel: 'priest_buff',
          supportedPartyRoles: ['BUFF', 'DPS'] as const,
          sessionRoles: ['BUFF'] as const,
        });
      },
    );
    const fulfill = vi.fn(() => Promise.resolve(true));
    const tx = joinTx({
      getLfgIntentById: () =>
        Promise.resolve({
          id: 'intent-b',
          guildId: 'g1',
          organizationId: 'o1',
          recipientDiscordUserId: 'seeker',
          characterId: CHARACTER_B,
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
      fulfillLfgIntent: fulfill,
      countParticipationsByPartyRole: () => Promise.resolve({ TANK: 1, BUFF: 0, DPS: 3 }),
    });
    await joinLfgActivity(
      tx,
      { discordUserId: 'seeker' },
      {
        activityId: '11111111-1111-4111-8111-111111111111',
        statusDefId: 'status-1',
        partyRoleKey: 'BUFF',
        guildId: 'g1',
        intentId: 'intent-b',
        characterId: CHARACTER_A,
      },
      { resolveCharacter },
      NOW,
    );
    expect(resolveCharacter).toHaveBeenCalledWith(
      expect.objectContaining({ characterId: CHARACTER_B, sessionRoles: ['BUFF'] }),
    );
    expect(fulfill).toHaveBeenCalledWith('intent-b', 'seeker', NOW);
  });

  it('fulfills only the joined intent when multiple active intents exist', async () => {
    const fulfill = vi.fn(() => Promise.resolve(true));
    const tx = joinTx({
      getLfgIntentById: (id: string) =>
        Promise.resolve({
          id,
          guildId: 'g1',
          organizationId: 'o1',
          recipientDiscordUserId: 'seeker',
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
      fulfillLfgIntent: fulfill,
      countParticipationsByPartyRole: () => Promise.resolve({ TANK: 1, BUFF: 0, DPS: 3 }),
    });
    await joinLfgActivity(
      tx,
      { discordUserId: 'seeker' },
      {
        activityId: '11111111-1111-4111-8111-111111111111',
        statusDefId: 'status-1',
        partyRoleKey: 'BUFF',
        guildId: 'g1',
        intentId: 'intent-2',
        characterId: CHAR_ID,
      },
      characterVerifyStub(),
      NOW,
    );
    expect(fulfill).toHaveBeenCalledOnce();
    expect(fulfill).toHaveBeenCalledWith('intent-2', 'seeker', NOW);
  });
});

describe('createLfgFullGroupWatch', () => {
  it('verifies character ownership before creating watch', async () => {
    const tx = makeTx({
      countParticipationsByPartyRole: () => Promise.resolve({ TANK: 1, BUFF: 1, DPS: 4 }),
      countOccupiedParticipations: () => Promise.resolve(8),
    });
    await expect(
      createLfgFullGroupWatch(
        tx,
        { discordUserId: 'u1' },
        {
          guildId: 'g1',
          organizationId: 'o1',
          activityId: '11111111-1111-4111-8111-111111111111',
          characterId: UNKNOWN_CHAR_ID,
          sessionRoles: ['BUFF'],
        },
        characterVerifyStub(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
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
  it('wires enqueueUserNotification with deliveryActions for eligible intent', async () => {
    const enqueue = vi.spyOn(notificationUseCases, 'enqueueUserNotification').mockResolvedValue({
      created: true,
      suppressed: false,
      inboxItemId: 'inbox-1',
    });
    const tx = makeTx();
    const sent = await notifyLfgIntentsForActivity(
      tx,
      baseActivity(),
      'azrael',
      allowAuthorize,
      characterVerifyStub(),
      NOW,
    );
    expect(sent).toBe(1);
    expect(enqueue).toHaveBeenCalledOnce();
    const notifyInput = enqueue.mock.calls[0]?.[1];
    expect(notifyInput).toMatchObject({
      deliveryActions: {
        template: 'lfg_match',
        suggestedPartyRole: 'BUFF',
        intentId: '33333333-3333-4333-8333-333333333333',
        intentOpaqueId: '333333333333',
      },
    });
    expect(notifyInput?.deliveryActions?.eligiblePartyRoles).toContain('BUFF');
    enqueue.mockRestore();
  });

  it('skips notify when membership lost (JOIN denied)', async () => {
    const enqueue = vi.spyOn(notificationUseCases, 'enqueueUserNotification');
    const tx = makeTx();
    const sent = await notifyLfgIntentsForActivity(
      tx,
      baseActivity(),
      'azrael',
      denyAuthorize,
      characterVerifyStub(),
      NOW,
    );
    expect(sent).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
    enqueue.mockRestore();
  });

  it('skips notify when intent is suppressed', async () => {
    const enqueue = vi.spyOn(notificationUseCases, 'enqueueUserNotification');
    const tx = makeTx({ isLfgIntentSuppressed: () => Promise.resolve(true) });
    const sent = await notifyLfgIntentsForActivity(
      tx,
      baseActivity(),
      'azrael',
      allowAuthorize,
      characterVerifyStub(),
      NOW,
    );
    expect(sent).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
    enqueue.mockRestore();
  });

  it('returns zero when no active intents match', async () => {
    const tx = makeTx({ listActiveLfgIntents: () => Promise.resolve([]) });
    const sent = await notifyLfgIntentsForActivity(
      tx,
      baseActivity(),
      'azrael',
      allowAuthorize,
      characterVerifyStub(),
      NOW,
    );
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
