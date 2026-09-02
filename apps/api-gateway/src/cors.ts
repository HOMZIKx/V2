export function parseCorsOrigins(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === '') {
    return [
      'http://127.0.0.1:3000',
      'http://localhost:3000',
      'http://127.0.0.1:3001',
      'http://localhost:3001',
    ];
  }
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export const CORS_ALLOW_HEADERS =
  'Content-Type, Accept, Idempotency-Key, If-Match, X-Request-Id, X-Correlation-Id, X-Actor-Discord-User-Id';

export const CORS_ALLOW_METHODS = 'GET,POST,PATCH,PUT,DELETE,OPTIONS';

type CorsRequest = {
  headers: { origin?: string | string[] | undefined };
  method: string;
};

type CorsReply = {
  header: (key: string, value: string) => unknown;
  code: (status: number) => CorsReply;
  status: (code: number) => { send: (body?: unknown) => unknown };
  send: (body?: unknown) => unknown;
};

/**
 * Fastify onRequest CORS helper.
 * OPTIONS for an allowed origin: sets credentialed headers, sends 204, returns true (caller must not call done()).
 * Other requests: may set CORS headers and returns false (caller must call done()).
 */
export function applyCorsOnRequest(
  request: CorsRequest,
  reply: CorsReply,
  corsOrigins: readonly string[],
): boolean {
  const originHeader = request.headers.origin;
  const origin = typeof originHeader === 'string' ? originHeader : undefined;
  const allowed = origin !== undefined && corsOrigins.includes(origin);

  if (allowed && origin !== undefined) {
    void reply.header('Access-Control-Allow-Origin', origin);
    void reply.header('Access-Control-Allow-Credentials', 'true');
    void reply.header('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS);
    void reply.header('Access-Control-Allow-Methods', CORS_ALLOW_METHODS);
    void reply.header('Vary', 'Origin');
  }

  if (request.method === 'OPTIONS') {
    if (allowed) {
      void reply.code(204).send();
    } else {
      void reply.code(204).send();
    }
    return true;
  }

  return false;
}
