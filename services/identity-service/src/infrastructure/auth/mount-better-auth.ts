import fastifyCors from '@fastify/cors';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { IdentityEnv } from '../config/identity-env.js';
import type { BetterAuthInstance } from './create-better-auth.js';

interface MountOptions {
  readonly fastify: FastifyInstance;
  readonly auth: BetterAuthInstance;
  readonly config: IdentityEnv;
}

function toFetchHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }
    } else {
      headers.append(key, value);
    }
  }
  return headers;
}

function toFetchBody(request: FastifyRequest): string | undefined {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return undefined;
  }
  const body = request.body;
  if (body === undefined || body === null) {
    return undefined;
  }
  return typeof body === 'string' ? body : JSON.stringify(body);
}

async function forwardResponse(response: Response, reply: FastifyReply): Promise<void> {
  reply.status(response.status);

  // Forward every header. Set-Cookie must be handled separately so multiple
  // cookies are preserved as distinct headers instead of being comma-joined.
  const setCookies = response.headers.getSetCookie();
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      return;
    }
    reply.header(key, value);
  });
  if (setCookies.length > 0) {
    reply.header('set-cookie', setCookies);
  }

  const text = await response.text();
  reply.send(text.length > 0 ? text : null);
}

/**
 * Register the official Better Auth Fastify integration:
 * - `@fastify/cors` restricted to the trusted-origin allowlist with credentials;
 * - a catch-all route under `IDENTITY_AUTH_BASE_PATH` that converts each Fastify
 *   request into a Fetch `Request`, delegates to `auth.handler`, and forwards
 *   status, headers, body, and all Set-Cookie headers back unmodified.
 */
export async function mountBetterAuth(options: MountOptions): Promise<void> {
  const { fastify, auth, config } = options;

  await fastify.register(fastifyCors, {
    origin: [...config.IDENTITY_TRUSTED_ORIGINS],
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  });

  const authRoute = `${config.IDENTITY_AUTH_BASE_PATH.replace(/\/$/, '')}/*`;

  fastify.route({
    method: ['GET', 'POST'],
    url: authRoute,
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const url = new URL(request.url, config.IDENTITY_AUTH_BASE_URL);
      const body = toFetchBody(request);
      const init: RequestInit = {
        method: request.method,
        headers: toFetchHeaders(request),
      };
      if (body !== undefined) {
        init.body = body;
      }
      const fetchRequest = new Request(url.toString(), init);

      const response = await auth.handler(fetchRequest);
      await forwardResponse(response, reply);
    },
  });
}
