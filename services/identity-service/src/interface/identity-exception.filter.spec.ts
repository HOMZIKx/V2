import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { IdentityError, type IdentityErrorCode } from '../domain/errors.js';
import { IdentityExceptionFilter } from './identity-exception.filter.js';

function fakeHost(): {
  host: ArgumentsHost;
  status: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
} {
  const send = vi.fn();
  const status = vi.fn().mockReturnValue({ send });
  const reply = { status };
  const host = {
    switchToHttp: () => ({ getResponse: () => reply }),
  } as unknown as ArgumentsHost;
  return { host, status, send };
}

describe('IdentityExceptionFilter', () => {
  const cases: Array<[IdentityErrorCode, number]> = [
    ['UNAUTHENTICATED', 401],
    ['NOT_FOUND', 404],
    ['CANNOT_UNLINK_LAST', 409],
    ['ACCOUNT_ALREADY_LINKED', 409],
    ['VALIDATION_FAILED', 400],
    ['AUTH_DISABLED', 503],
  ];

  it.each(cases)('maps %s to HTTP %i', (code, expected) => {
    const filter = new IdentityExceptionFilter();
    const { host, status, send } = fakeHost();

    filter.catch(new IdentityError(code), host);

    expect(status).toHaveBeenCalledWith(expected);
    expect(send).toHaveBeenCalledWith({ error: { code, message: code } });
  });
});
