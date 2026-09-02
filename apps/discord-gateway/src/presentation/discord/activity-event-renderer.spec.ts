import { ComponentType, MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';

import { formatEventCapacity, renderActivityEventMessage } from './activity-event-renderer.js';

const secret = 'test-signing-secret-at-least-32-bytes-long!!';

function toJson(component: unknown): Record<string, unknown> {
  return (component as { toJSON: () => Record<string, unknown> }).toJSON();
}

describe('activity-event-renderer', () => {
  it('renders public event Components V2 without admin-only actions', () => {
    const payload = renderActivityEventMessage({
      opaqueEventId: 'f6e5d4c3b2a1',
      signingSecret: secret,
      name: 'Raid',
      typeLabel: 'PvE',
      statusLabel: 'Zapisy otwarte',
      startAtIso: '2026-08-20T18:00:00.000Z',
      organizerLabel: 'Org#1',
      occupiedSlots: 1,
      participantLimit: 8,
      statusSummaries: [{ label: 'Będę', count: 1 }],
      statusDefs: [
        { opaqueId: '112233445566', label: 'Będę', occupiesSlot: true },
        { opaqueId: '223344556677', label: 'Może', occupiesSlot: false },
        { opaqueId: '334455667788', label: 'Nie', occupiesSlot: false },
      ],
    });

    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
    expect(payload.components).toHaveLength(1);
    expect(payload).not.toHaveProperty('embeds');
    const container = toJson(payload.components![0]);
    expect(container.type).toBe(ComponentType.Container);
    const json = JSON.stringify(container);
    expect(container.accent_color).toBe(0xd48632);
    expect(json).toContain('Miejsca: 1/8');
    expect(json).toContain(':event:f6e5d4c3b2a1:rsvp:112233445566');
    expect(json).toContain('Lista uczestników');
    expect(json).toContain('Kontakt');
    expect(json).toContain('Więcej');
    expect(json).not.toContain(':takeover');
    expect(json).not.toContain(':cancel');
    expect(json).not.toContain('Zgłoś');
  });

  it('disables RSVP buttons when cancelled/closed', () => {
    const payload = renderActivityEventMessage({
      opaqueEventId: 'f6e5d4c3b2a1',
      signingSecret: secret,
      name: 'Raid',
      typeLabel: 'PvE',
      statusLabel: 'Anulowane',
      startAtIso: '2026-08-20T18:00:00.000Z',
      organizerLabel: 'Org#1',
      occupiedSlots: 0,
      participantLimit: null,
      statusSummaries: [],
      statusDefs: [{ opaqueId: '112233445566', label: 'Będę', occupiesSlot: true }],
      rsvpDisabled: true,
    });
    const json = JSON.stringify(toJson(payload.components![0]));
    expect(json).toMatch(/"disabled"\s*:\s*true/);
  });

  it('prefers natural scheduleLabel over raw ISO timestamps', () => {
    const payload = renderActivityEventMessage({
      opaqueEventId: 'f6e5d4c3b2a1',
      signingSecret: secret,
      name: 'Azrael',
      typeLabel: 'Dungeon',
      statusLabel: 'Zapisy otwarte',
      startAtIso: '2026-08-20T16:00:00.000Z',
      scheduleLabel: 'W tym tygodniu',
      organizerLabel: 'Org#1',
      occupiedSlots: 0,
      participantLimit: 8,
      statusSummaries: [],
      statusDefs: [],
    });
    const json = JSON.stringify(toJson(payload.components![0]));
    expect(json).toContain('W tym tygodniu');
    expect(json).not.toContain('2026-08-20T16:00:00.000Z');
  });

  it('formats finite capacity as occupied/limit', () => {
    expect(formatEventCapacity(3, 8)).toBe('Miejsca: 3/8');
    const payload = renderActivityEventMessage({
      opaqueEventId: 'f6e5d4c3b2a1',
      signingSecret: secret,
      name: 'Azrael',
      typeLabel: 'Dungeon',
      statusLabel: 'Zapisy otwarte',
      startAtIso: '2026-08-20T18:00:00.000Z',
      organizerLabel: 'Alex',
      occupiedSlots: 3,
      participantLimit: 8,
      statusSummaries: [],
      statusDefs: [],
    });
    const json = JSON.stringify(toJson(payload.components![0]));
    expect(json).toContain('Miejsca: 3/8');
    expect(json).not.toContain('3 miejsc');
  });

  it('formats unlimited capacity with explicit bez limitu and occupied count', () => {
    expect(formatEventCapacity(3, null)).toBe('Miejsca: bez limitu · zapisanych: 3');
    const payload = renderActivityEventMessage({
      opaqueEventId: 'f6e5d4c3b2a1',
      signingSecret: secret,
      name: 'Azrael',
      typeLabel: 'Dungeon',
      statusLabel: 'Zapisy otwarte',
      startAtIso: '2026-08-20T18:00:00.000Z',
      organizerLabel: 'Alex',
      occupiedSlots: 3,
      participantLimit: null,
      statusSummaries: [],
      statusDefs: [],
    });
    const json = JSON.stringify(toJson(payload.components![0]));
    expect(json).toContain('bez limitu');
    expect(json).toContain('zapisanych: 3');
    expect(json).not.toContain('3 miejsc');
  });
});
