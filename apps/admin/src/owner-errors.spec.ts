import { describe, expect, it } from 'vitest';

import { ApiClientError } from './api/http.js';
import { ownerFacingMessage } from './owner-errors.js';

describe('ownerFacingMessage', () => {
  it('maps revision conflict to a Polish owner message', () => {
    const mapped = ownerFacingMessage(
      new ApiClientError('HTTP 409 REVISION_CONFLICT', {
        status: 409,
        code: 'CONFLICT',
      }),
    );
    expect(mapped.message).toContain('Konfiguracja zmieniła się');
    expect(mapped.detail).toContain('REVISION_CONFLICT');
    expect(mapped.conflict).toBe(true);
  });

  it('maps forbidden to a Polish owner message', () => {
    const mapped = ownerFacingMessage(
      new ApiClientError('Nope', { status: 403, code: 'FORBIDDEN' }),
    );
    expect(mapped.message).toBe('Nie masz uprawnień do tej operacji.');
    expect(mapped.forbidden).toBe(true);
  });
});
