import { describe, expect, it } from 'vitest';

import { countOccupiedSlots } from '../domain/capacity.js';
import {
  toMemberActivityListItem,
  UNKNOWN_MEMBER_DISPLAY,
} from './member-activity-presentation.js';
import type { ActivityRecord, ParticipationRecord } from './ports/activity.ports.js';

const activity = {
  id: 'act-1',
  guildId: 'guild-1',
  organizationId: 'org-1',
  typeId: 'type-1',
  name: 'Azrael',
  description: '',
  startAt: new Date('2026-08-20T18:00:00.000Z'),
  endAt: null,
  scheduleKind: 'exact',
  periodKey: null,
  scheduleHasExplicitTime: true,
  status: 'registrations_open',
  enrollmentOpen: true,
  participantLimit: 8,
  participantMode: 'shared',
  organizerDiscordUserId: 'org-discord',
  organizerV2UserId: null,
  coOrganizerDiscordUserId: null,
  coOrganizerV2UserId: null,
  publicationChannelId: null,
  timezone: 'Europe/Warsaw',
  locationText: null,
  cancelReason: null,
  cancelledAt: null,
  version: 1,
  scheduledFinishAt: new Date('2026-08-20T20:00:00.000Z'),
  opaqueId: 'aabbccddeeff',
  createdAt: new Date(),
  updatedAt: new Date(),
} as ActivityRecord;

function participation(
  patch: Partial<ParticipationRecord> & Pick<ParticipationRecord, 'id'>,
): ParticipationRecord {
  return {
    activityId: 'act-1',
    discordUserId: 'user-1',
    v2UserId: null,
    statusDefId: 'status-confirmed',
    confirmationState: 'confirmed',
    reconfirmDeadline: null,
    waitlistPosition: null,
    scopeGuildId: null,
    resignedAt: null,
    removedAt: null,
    removeReason: null,
    occupiesSlot: true,
    statusBehavior: 'confirmed',
    ...patch,
  };
}

describe('member activity presentation', () => {
  it('uses countOccupiedSlots for finite capacity extras', () => {
    const rows = [
      participation({ id: 'p1', discordUserId: 'a' }),
      participation({ id: 'p2', discordUserId: 'b' }),
      participation({ id: 'p3', discordUserId: 'c', occupiesSlot: false }),
    ];
    const item = toMemberActivityListItem({
      activity,
      participations: rows,
      actor: { discordUserId: 'a' },
      statusById: new Map([
        [
          'status-confirmed',
          {
            id: 'status-confirmed',
            guildId: 'guild-1',
            label: 'Będę',
            occupiesSlot: true,
            behavior: 'confirmed',
            selectableByMember: true,
            active: true,
            sortOrder: 10,
            seedKey: 'confirmed',
          },
        ],
      ]),
      typeById: new Map([
        [
          'type-1',
          {
            id: 'type-1',
            guildId: 'guild-1',
            key: 'dungeon',
            label: 'Dungeon',
            enabled: true,
            isOther: false,
            sortOrder: 1,
            statusDefIds: [],
            participantFields: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      ]),
      displayByDiscordId: new Map([['org-discord', 'KuzynPasek']]),
    });
    expect(item.occupiedSlots).toBe(countOccupiedSlots(rows));
    expect(item.occupiedSlots).toBe(2);
    expect(item.organizerDisplay).toBe('KuzynPasek');
    expect(item.typeLabel).toBe('Dungeon');
    expect(item.myParticipationStatus?.statusLabel).toBe('Będę');
    expect(item).not.toHaveProperty('version');
  });

  it('does not leak another user participation as mine', () => {
    const item = toMemberActivityListItem({
      activity,
      participations: [participation({ id: 'p1', discordUserId: 'user-a' })],
      actor: { discordUserId: 'user-b' },
      statusById: new Map(),
      typeById: new Map(),
      displayByDiscordId: new Map(),
    });
    expect(item.myParticipationStatus).toBeNull();
    expect(item.organizerDisplay).toBe(UNKNOWN_MEMBER_DISPLAY);
  });
});
