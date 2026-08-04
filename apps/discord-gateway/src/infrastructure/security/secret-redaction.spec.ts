import { describe, expect, it } from 'vitest';

import { redactSecrets, safeErrorMessage } from './secret-redaction.js';

describe('secret redaction', () => {
  it('redacts explicit secrets and bot token patterns', () => {
    const token = 'FAKESECRET_m4n5o6p7q8r9s0t1u2v3';
    const signing = 'super-secret-signing-value-0123456789';
    const raw = `login failed token=${token} secret=${signing} Bot ${token}`;
    const redacted = redactSecrets(raw, [token, signing]);
    expect(redacted).not.toContain(token);
    expect(redacted).not.toContain(signing);
    expect(redacted).toContain('[REDACTED]');
  });

  it('safeErrorMessage never returns raw secret', () => {
    const secret = 'discord-test-token-value-abcdefghij';
    const message = safeErrorMessage(new Error(`boom ${secret}`), [secret]);
    expect(message).not.toContain(secret);
  });
});
