import { describe, expect, it } from 'vitest';

import { opaqueIdFromUuid } from '../domain/opaque-id.js';
import { buildEventProjectionPayload } from './event-projection-payload.js';
import type {
  ActivityRecord,
  ActivityTypeRecord,
  ParticipationRecord,
  ParticipationStatusDefRecord,
} from './ports/activity.ports.js';

function activity(overrides: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    guildId: 'g1',
    organizationId: 'org',
    typeId: '22222222-2222-4222-8222-222222222222',
    name: 'Raid',
    description: 'desc',
    startAt: new Date('2026-08-22T18:00:00.000Z'),
    endAt: null,
    scheduleKind: 'exact',
    periodKey: null,
    scheduleHasExplicitTime: true,
    status: 'registrations_open',
    enrollmentOpen: true,
    participantLimit: 4,
    participantMode: 'shared',
    seriesId: null,
    seriesOccurrenceIndex: null,
    visibility: 'public',
    privateInviteTokenHash: null,
    privateRoleIds: [],
    organizerDiscordUserId: '100',
    organizerV2UserId: null,
    coOrganizerDiscordUserId: null,
    coOrganizerV2UserId: null,
    publicationChannelId: 'c1',
    timezone: 'Europe/Warsaw',
    locationText: null,
    cancelReason: null,
    cancelledAt: null,
    version: 3,
    scheduledFinishAt: new Date('2026-08-22T20:00:00.000Z'),
    opaqueId: 'aaaaaaaaaaaa',
    createdAt: new Date('2026-08-21T00:00:00.000Z'),
    updatedAt: new Date('2026-08-21T00:00:00.000Z'),
    ...overrides,
  };
}

const type: ActivityTypeRecord = {
  id: '22222222-2222-4222-8222-222222222222',
  guildId: 'g1',
  key: 'raid',
  label: 'Rajd',
  enabled: true,
  isOther: false,
  sortOrder: 1,
  statusDefIds: [],
  participantFields: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const statusDef: ParticipationStatusDefRecord = {
  id: '33333333-3333-4333-8333-333333333333',
  guildId: 'g1',
  label: 'Będę',
  occupiesSlot: true,
  behavior: 'confirmed',
  selectableByMember: true,
  active: true,
  sortOrder: 1,
  seedKey: 'going',
};

describe('buildEventProjectionPayload', () => {
  it('emits a full Discord event DTO including messageId for edit-in-place', () => {
    const participation: ParticipationRecord = {
      id: 'p1',
      activityId: activity().id,
      discordUserId: '200',
      v2UserId: null,
      statusDefId: statusDef.id,
      confirmationState: 'confirmed',
      reconfirmDeadline: null,
      waitlistPosition: null,
      scopeGuildId: null,
      resignedAt: null,
      removedAt: null,
      removeReason: null,
      occupiesSlot: true,
      statusBehavior: 'confirmed',
    };

    const payload = buildEventProjectionPayload({
      activity: activity(),
      channelId: 'c1',
      opaqueEventId: 'aaaaaaaaaaaa',
      messageId: 'm-existing',
      types: [type],
      statusDefs: [statusDef],
      participations: [participation],
      participantLimit: 4,
    });

    expect(payload).not.toBeNull();
    expect(payload?.remove).toBe(false);
    if (payload === null || payload.remove === true) {
      throw new Error('expected event payload');
    }
    expect(payload.kind).toBe('event');
    expect(payload.messageId).toBe('m-existing');
    expect(payload.name).toBe('Raid');
    expect(payload.typeLabel).toBe('Rajd');
    expect(payload.statusLabel).toBe('Zapisy otwarte');
    expect(payload.occupiedSlots).toBe(1);
    expect(payload.statusDefs[0]?.opaqueId).toBe(opaqueIdFromUuid(statusDef.id));
    expect(payload.rsvpDisabled).toBe(false);
  });

  it('emits remove when activity is deleted and a Discord message exists', () => {
    const payload = buildEventProjectionPayload({
      activity: activity({ status: 'deleted', enrollmentOpen: false }),
      channelId: 'c1',
      opaqueEventId: 'aaaaaaaaaaaa',
      messageId: 'm-to-delete',
      types: [type],
      statusDefs: [statusDef],
      participations: [],
      participantLimit: 4,
    });
    expect(payload).toEqual({
      kind: 'event',
      activityId: activity().id,
      guildId: 'g1',
      channelId: 'c1',
      messageId: 'm-to-delete',
      opaqueEventId: 'aaaaaaaaaaaa',
      remove: true,
    });
  });

  it('skips projection when deleted activity never had a Discord message', () => {
    const payload = buildEventProjectionPayload({
      activity: activity({ status: 'deleted', enrollmentOpen: false }),
      channelId: 'c1',
      opaqueEventId: 'aaaaaaaaaaaa',
      messageId: null,
      types: [type],
      statusDefs: [statusDef],
      participations: [],
      participantLimit: 4,
    });
    expect(payload).toBeNull();
  });
});
