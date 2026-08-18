import { describe, expect, it } from 'vitest';

import { shouldUseServerSessionGate } from './session-cookie-host';

describe('shouldUseServerSessionGate', () => {
  it('keeps the local same-host cookie gate', () => {
    expect(shouldUseServerSessionGate('127.0.0.1', 'http://127.0.0.1:4000')).toBe(true);
  });

  it('defers to the client when WWW and API are different hosts', () => {
    expect(shouldUseServerSessionGate('v2-web.zeabur.app', 'https://v2-api.zeabur.app')).toBe(
      false,
    );
  });

  it('fails closed to the local-style gate on a malformed API URL', () => {
    expect(shouldUseServerSessionGate('v2-web.zeabur.app', 'not-a-url')).toBe(true);
  });
});
