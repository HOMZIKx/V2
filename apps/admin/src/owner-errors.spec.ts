import { describe, expect, it } from 'vitest';

import { ApiClientError } from './api/http.js';
import { ApiNetworkError, classifyNetworkFailure } from './api/network-error.js';
import { ACTIVITY_SERVICE_UNAVAILABLE, ownerFacingMessage } from './owner-errors.js';

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

  it('maps unauthenticated to a Discord login prompt', () => {
    const mapped = ownerFacingMessage(
      new ApiClientError('no session', { status: 401, code: 'UNAUTHENTICATED' }),
    );
    expect(mapped.message).toBe('Zaloguj się przez Discord, aby zarządzać serwerem.');
    expect(mapped.message).not.toContain('Failed to fetch');
  });

  it('maps forbidden to a Polish owner message', () => {
    const mapped = ownerFacingMessage(
      new ApiClientError('Nope', { status: 403, code: 'FORBIDDEN' }),
    );
    expect(mapped.message).toBe('Nie masz uprawnień do tej operacji.');
    expect(mapped.forbidden).toBe(true);
  });

  it('never exposes raw Failed to fetch as primary UI copy', () => {
    const mapped = ownerFacingMessage(new TypeError('Failed to fetch'));
    expect(mapped.message).toBe(ACTIVITY_SERVICE_UNAVAILABLE);
    expect(mapped.message).not.toContain('Failed to fetch');
  });

  it('maps network failures to activity service unavailable copy', () => {
    const mapped = ownerFacingMessage(
      new ApiNetworkError({
        kind: 'SERVICE_NOT_RUNNING',
        url: 'http://127.0.0.1:4400/activity/v1/admin/guilds',
        method: 'GET',
        cause: new TypeError('Failed to fetch'),
      }),
    );
    expect(mapped.message).toBe(ACTIVITY_SERVICE_UNAVAILABLE);
    expect(mapped.detail).toContain('SERVICE_NOT_RUNNING');
    expect(mapped.detail).toContain('GET');
  });

  it('maps duplicate activity type keys to readable conflict handling', () => {
    const mapped = ownerFacingMessage(
      new ApiClientError('Activity type key already exists', {
        status: 409,
        code: 'CONFLICT',
      }),
    );
    expect(mapped.message).toContain('Typ o tej nazwie już istnieje');
    expect(mapped.fields.key).toBeDefined();
  });
});

describe('classifyNetworkFailure', () => {
  it('classifies local connection failures as SERVICE_NOT_RUNNING', () => {
    const error = classifyNetworkFailure(
      new TypeError('Failed to fetch'),
      new URL('http://127.0.0.1:4400/activity/v1/admin/guilds'),
      'GET',
    );
    expect(error.kind).toBe('SERVICE_NOT_RUNNING');
  });
});
