import { describe, expect, it } from 'vitest';

import { generateSigningSecret } from './signed-custom-id.js';
import {
  createTimerButtonCustomId,
  decodeTimerButtonPayload,
  encodeTimerButtonPayload,
  parseTimerButtonCustomId,
} from './timer-custom-id.js';

describe('timer custom id', () => {
  const secret = generateSigningSecret(32);
  const sample = { mapKey: 'a1', channel: 2, timerKey: 'metin-a1-ch2-eid1' };

  it('encodes and decodes payload without colons', () => {
    const encoded = encodeTimerButtonPayload(sample);
    expect(encoded.includes(':')).toBe(false);
    expect(decodeTimerButtonPayload(encoded)).toEqual(sample);
  });

  it('round-trips signed Zbite / Odłóż custom ids under Discord limit', () => {
    for (const operation of ['zbite', 'odloz'] as const) {
      const customId = createTimerButtonCustomId(operation, sample, secret);
      expect(customId.length).toBeLessThanOrEqual(100);
      const parsed = parseTimerButtonCustomId(customId, secret);
      expect(parsed.operation).toBe(operation);
      expect(parsed.payload).toEqual(sample);
    }
  });

  it('rejects tampered timer custom id', () => {
    const customId = createTimerButtonCustomId('zbite', sample, secret);
    const tampered = `${customId.slice(0, -2)}aa`;
    expect(() => parseTimerButtonCustomId(tampered, secret)).toThrow(/signature|format|version|timer/i);
  });
});
