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
});
