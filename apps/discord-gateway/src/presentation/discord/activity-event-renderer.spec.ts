import { ComponentType, MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';

import { renderActivityEventMessage } from './activity-event-renderer.js';

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
});
