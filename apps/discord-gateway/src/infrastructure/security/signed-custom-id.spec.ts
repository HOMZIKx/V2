import { describe, expect, it } from 'vitest';

import {
  createSignedCustomId,
  generateSigningSecret,
  panelPayload,
  parseSignedCustomId,
} from './signed-custom-id.js';

describe('signed custom ids', () => {
  const secret = generateSigningSecret(32);

  it('round-trips a valid custom id under Discord length limit', () => {
    const customId = createSignedCustomId('select', panelPayload(), secret);
    expect(customId.length).toBeLessThanOrEqual(100);
    const parsed = parseSignedCustomId(customId, secret);
    expect(parsed.action).toBe('select');
    expect(parsed.payload).toBe(panelPayload());
  });

  it('rejects tampered payload', () => {
    const customId = createSignedCustomId('refresh', panelPayload(), secret);
    const tampered = customId.replace(':p1:', ':p9:');
    expect(() => parseSignedCustomId(tampered, secret)).toThrow(/signature|format|version/i);
  });

  it('rejects unknown version and action', () => {
    expect(() =>
      parseSignedCustomId(`v9:select:${panelPayload()}:deadbeefdeadbeef`, secret),
    ).toThrow(/version/i);
    expect(() => parseSignedCustomId(`v1:hack:${panelPayload()}:deadbeefdeadbeef`, secret)).toThrow(
      /action|signature/i,
    );
  });

  it('generateSigningSecret produces enough entropy bytes when decoded', () => {
    const value = generateSigningSecret(32);
    expect(value.length).toBeGreaterThanOrEqual(40);
  });

  it('supports timer and war actions', () => {
    for (const action of ['timer_zbite', 'timer_odloz', 'war_claim'] as const) {
      const customId = createSignedCustomId(action, 'payload1', secret);
      expect(parseSignedCustomId(customId, secret).action).toBe(action);
    }
  });

  it('supports hub Centrum actions under Discord length limit', () => {
    for (const action of [
      'hub_create',
      'hub_lfg',
      'hub_mine',
      'hub_notify',
      'hub_profile',
      'hub_forme',
      'hub_ephem',
    ] as const) {
      const payload = action === 'hub_ephem' ? 'p1bbtn_test01' : 'p1';
      const customId = createSignedCustomId(action, payload, secret);
      expect(customId.length).toBeLessThanOrEqual(100);
      expect(parseSignedCustomId(customId, secret).action).toBe(action);
    }
  });
});
