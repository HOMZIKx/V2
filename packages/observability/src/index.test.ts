import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveRequestIds } from './correlation.js';
import { createLogger } from './logger.js';
import { operationalCategoryFromCode } from './operational-error.js';
import { redactLogContext } from './redact.js';

describe('createLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes structured entries for every level with and without context', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const logger = createLogger('test-service');
    logger.debug('dbg');
    logger.info('started', { port: 3000, event: 'boot' });
    logger.warn('slow');
    logger.error('failed', { code: 'EFAIL' });

    expect(debug).toHaveBeenCalledWith(expect.stringContaining('"level":"debug"'));
    expect(info).toHaveBeenCalledWith(expect.stringContaining('"service":"test-service"'));
    expect(info).toHaveBeenCalledWith(expect.stringContaining('"event":"boot"'));
    expect(info).toHaveBeenCalledWith(expect.stringContaining('"context"'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"level":"warn"'));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('"code":"EFAIL"'));
  });

  it('redacts tokens and secrets in log context', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const logger = createLogger('test-service');
    logger.info('cfg', { discordToken: 'abc', database_url: 'postgres://x', guildId: 'g1' });
    const payload = String(info.mock.calls[0]?.[0]);
    expect(payload).toContain('[redacted]');
    expect(payload).not.toContain('postgres://x');
    expect(payload).not.toContain('"abc"');
    expect(payload).toContain('"g1"');
  });
});

describe('resolveRequestIds', () => {
  it('reuses inbound correlation and request ids', () => {
    expect(
      resolveRequestIds({
        'x-correlation-id': 'corr-1',
        'x-request-id': 'req-1',
      }),
    ).toEqual({ correlationId: 'corr-1', requestId: 'req-1', generated: false });
  });

  it('generates a shared id when headers are missing', () => {
    const resolved = resolveRequestIds({});
    expect(resolved.generated).toBe(true);
    expect(resolved.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(resolved.requestId).toBe(resolved.correlationId);
  });
});

describe('redactLogContext', () => {
  it('returns undefined for missing context', () => {
    expect(redactLogContext(undefined)).toBeUndefined();
  });
});

describe('operationalCategoryFromCode', () => {
  it('maps current activity codes to operator categories', () => {
    expect(operationalCategoryFromCode('FORBIDDEN')).toBe('AUTHZ_DENIED');
    expect(operationalCategoryFromCode('UNAUTHENTICATED')).toBe('AUTH_FAILURE');
    expect(operationalCategoryFromCode('CONFIG_INVALID')).toBe('DEPENDENCY_UNAVAILABLE');
    expect(operationalCategoryFromCode('CONFLICT')).toBe('CONFLICT');
    expect(operationalCategoryFromCode('VALIDATION_FAILED')).toBe('CONFIG_ERROR');
    expect(operationalCategoryFromCode(undefined)).toBe('INTERNAL_ERROR');
    expect(operationalCategoryFromCode('X', { timeout: true })).toBe('TIMEOUT');
    expect(operationalCategoryFromCode('X', { retryExhausted: true })).toBe('RETRY_EXHAUSTED');
  });
});
