import { describe, expect, it, vi } from 'vitest';

import { applyCorsOnRequest, parseCorsOrigins } from './cors.js';

function mockReply() {
  const headers: Record<string, string> = {};
  let statusCode: number | undefined;
  let sent = false;
  const reply = {
    header(key: string, value: string) {
      headers[key] = value;
      return this;
    },
    code(status: number) {
      statusCode = status;
      return this;
    },
    status(code: number) {
      statusCode = code;
      return {
        send() {
          sent = true;
        },
      };
    },
    send() {
      sent = true;
      return this;
    },
  };
  return { reply, headers, getStatus: () => statusCode, wasSent: () => sent };
}

describe('parseCorsOrigins', () => {
  it('defaults include web and admin local origins', () => {
    expect(parseCorsOrigins(undefined)).toEqual(
      expect.arrayContaining([
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'http://localhost:3000',
        'http://localhost:3001',
      ]),
    );
  });
});

describe('applyCorsOnRequest', () => {
  const origins = parseCorsOrigins(undefined);

  it('OPTIONS for allowed origin returns 204, ends request, sets credentialed CORS', () => {
    const { reply, headers, getStatus, wasSent } = mockReply();
    const ended = applyCorsOnRequest(
      { method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:3001' } },
      reply,
      origins,
    );
    expect(ended).toBe(true);
    expect(getStatus()).toBe(204);
    expect(wasSent()).toBe(true);
    expect(headers['Access-Control-Allow-Origin']).toBe('http://127.0.0.1:3001');
    expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    expect(headers['Access-Control-Allow-Headers']).toMatch(/X-Actor-Discord-User-Id/i);
  });

  it('GET for allowed origin sets CORS headers and does not end the request', () => {
    const { reply, headers, wasSent } = mockReply();
    const done = vi.fn();
    const ended = applyCorsOnRequest(
      { method: 'GET', headers: { origin: 'http://127.0.0.1:3000' } },
      reply,
      origins,
    );
    expect(ended).toBe(false);
    expect(wasSent()).toBe(false);
    expect(headers['Access-Control-Allow-Origin']).toBe('http://127.0.0.1:3000');
    // Caller must invoke done() exactly once for normal requests.
    if (!ended) {
      done();
    }
    expect(done).toHaveBeenCalledOnce();
  });

  it('OPTIONS for disallowed origin still ends without hanging', () => {
    const { reply, getStatus, wasSent, headers } = mockReply();
    const ended = applyCorsOnRequest(
      { method: 'OPTIONS', headers: { origin: 'http://evil.example' } },
      reply,
      origins,
    );
    expect(ended).toBe(true);
    expect(getStatus()).toBe(204);
    expect(wasSent()).toBe(true);
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});
