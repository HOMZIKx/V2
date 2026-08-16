import { describe, expect, it } from 'vitest';

import {
  createEventCustomId,
  createPanelCustomId,
  isActivityCustomId,
  parseActivityCustomId,
} from './activity-signed-custom-id.js';

const secret = 'test-signing-secret-at-least-32-bytes-long!!';
const panelOpaque = 'a1b2c3d4e5f6';
const eventOpaque = 'f6e5d4c3b2a1';
const statusOpaque = '112233445566';

describe('activity-signed-custom-id', () => {
  it('round-trips panel custom ids including panelId', () => {
    for (const action of ['create', 'lfg', 'mine', 'inbox'] as const) {
      const raw = createPanelCustomId(panelOpaque, action, secret);
      expect(raw.length).toBeLessThanOrEqual(100);
      expect(raw).toContain(`:panel:${panelOpaque}:${action}`);
      const parsed = parseActivityCustomId(raw, secret);
      expect(parsed).toMatchObject({ scope: 'panel', opaqueId: panelOpaque, action });
      expect(isActivityCustomId(raw)).toBe(true);
    }
  });

  it('never allows report on hub panel helpers', () => {
    expect(createPanelCustomId(panelOpaque, 'create', secret)).not.toContain(':report');
    expect(createPanelCustomId(panelOpaque, 'inbox', secret)).not.toContain('zgło');
  });

  it('round-trips event rsvp with status opaque id', () => {
    const raw = createEventCustomId(eventOpaque, 'rsvp', secret, statusOpaque);
    expect(raw.length).toBeLessThanOrEqual(100);
    const parsed = parseActivityCustomId(raw, secret);
    expect(parsed).toMatchObject({
      scope: 'event',
      opaqueId: eventOpaque,
      action: 'rsvp',
      statusOpaqueId: statusOpaque,
    });
  });

  it('rejects forged signatures', () => {
    const raw = createPanelCustomId(panelOpaque, 'create', secret);
    const tampered = `${raw.slice(0, -4)}aaaa`;
    expect(() => parseActivityCustomId(tampered, secret)).toThrow(/signature/i);
  });

  it('rejects unknown versions and oversize ids', () => {
    expect(() =>
      parseActivityCustomId('activity:v0:panel:a1b2c3d4e5f6:create:x', secret),
    ).toThrow();
    const longOpaque = 'a1b2c3d4e5f6';
    const customId = createEventCustomId(longOpaque, 'participants', secret);
    expect(customId.length).toBeLessThanOrEqual(100);
  });

  it('requires panel opaque id presence', () => {
    const raw = createPanelCustomId(panelOpaque, 'mine', secret);
    expect(raw.split(':')[3]).toBe(panelOpaque);
  });
});
