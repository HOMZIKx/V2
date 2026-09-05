import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ActivityError } from '../domain/errors.js';
import {
  ActivityExceptionFilter,
  UnhandledActivityExceptionFilter,
} from './activity-exception.filter.js';

function hostWith(reply: { status: (code: number) => { send: (body: unknown) => void } }) {
  return {
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () => ({ headers: { 'x-correlation-id': 'corr-1' } }),
    }),
  };
}

describe('ActivityExceptionFilter', () => {
  it('returns the activity code without a stack and includes an operator category', () => {
    const sent: { status?: number; body?: unknown } = {};
    const reply = {
      status(code: number) {
        sent.status = code;
        return this;
      },
      send(body: unknown) {
        sent.body = body;
      },
    };
    new ActivityExceptionFilter().catch(
      new ActivityError('FORBIDDEN', 'nope'),
      hostWith(reply) as never,
    );
    expect(sent.status).toBe(403);
    expect(sent.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'nope', category: 'FORBIDDEN' },
    });
    expect(JSON.stringify(sent.body)).not.toContain('stack');
  });
});

describe('UnhandledActivityExceptionFilter', () => {
  it('does not leak stack traces for unexpected errors', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sent: { status?: number; body?: unknown } = {};
    const reply = {
      status(code: number) {
        sent.status = code;
        return this;
      },
      send(body: unknown) {
        sent.body = body;
      },
    };
    new UnhandledActivityExceptionFilter().catch(
      new Error('ECONNREFUSED 127.0.0.1:5432'),
      hostWith(reply) as never,
    );
    expect(sent.status).toBe(500);
    expect(sent.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal error',
        category: 'INTERNAL',
      },
    });
    expect(JSON.stringify(sent.body)).not.toContain('ECONNREFUSED');
    vi.restoreAllMocks();
  });

  it('preserves HttpException payloads used by health ready', () => {
    const sent: { status?: number; body?: unknown } = {};
    const reply = {
      status(code: number) {
        sent.status = code;
        return this;
      },
      send(body: unknown) {
        sent.body = body;
      },
    };
    new UnhandledActivityExceptionFilter().catch(
      new HttpException({ status: 'error', checks: { database: false } }, 503),
      hostWith(reply) as never,
    );
    expect(sent.status).toBe(503);
    expect(sent.body).toMatchObject({ status: 'error' });
  });
});
