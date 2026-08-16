import {
  All,
  Controller,
  Headers,
  Inject,
  Optional,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  ACTIVITY_SERVICE_BASE_URL,
  API_GATEWAY_FORWARD_ACTOR_HEADERS,
  IDENTITY_SERVICE_BASE_URL,
} from './activity-proxy.tokens.js';
import { resolveSessionActor } from './session-actor.resolver.js';

/** Explicit allowlist — never forward Authorization / client assertions / proxy hop headers. */
const FORWARDED_HEADER_ALLOWLIST = new Set([
  'cookie',
  'content-type',
  'accept',
  'accept-language',
  'idempotency-key',
  'if-match',
  'x-request-id',
  'x-correlation-id',
]);

const ACTOR_HEADERS = new Set(['x-actor-discord-user-id', 'x-actor-v2-user-id']);

/**
 * Public BFF proxy: browser/admin → api-gateway → activity-service.
 * Forwards allowlisted headers; resolves Identity session → actor for WWW.
 */
@Controller()
export class ActivityProxyController {
  public constructor(
    @Inject(ACTIVITY_SERVICE_BASE_URL) private readonly activityBaseUrl: string | null,
    @Inject(API_GATEWAY_FORWARD_ACTOR_HEADERS)
    private readonly forwardActorHeaders: boolean,
    @Optional()
    @Inject(IDENTITY_SERVICE_BASE_URL)
    private readonly identityBaseUrl: string | null = null,
  ) {}

  @All(['activity/v1', 'activity/v1/*'])
  public async proxy(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Headers() incoming: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    if (this.activityBaseUrl === null || this.activityBaseUrl.length === 0) {
      throw new ServiceUnavailableException(
        'ACTIVITY_SERVICE_BASE_URL is not configured on api-gateway',
      );
    }

    const target = new URL(request.url, ensureTrailingSlash(this.activityBaseUrl));
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(incoming)) {
      if (value === undefined) {
        continue;
      }
      const lower = key.toLowerCase();
      if (ACTOR_HEADERS.has(lower)) {
        if (!this.forwardActorHeaders) {
          continue;
        }
        headers[lower] = Array.isArray(value) ? value.join(', ') : value;
        continue;
      }
      if (!FORWARDED_HEADER_ALLOWLIST.has(lower)) {
        continue;
      }
      headers[lower] = Array.isArray(value) ? value.join(', ') : value;
    }

    const sessionActor = await resolveSessionActor(headers.cookie, this.identityBaseUrl);
    if (sessionActor !== null) {
      headers['x-actor-discord-user-id'] = sessionActor.discordUserId;
      headers['x-actor-v2-user-id'] = sessionActor.v2UserId;
    }

    const method = request.method.toUpperCase();
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const init: RequestInit = {
      method,
      headers,
      redirect: 'manual',
    };
    if (hasBody && request.body !== undefined && request.body !== null) {
      init.body =
        typeof request.body === 'string' || Buffer.isBuffer(request.body)
          ? request.body
          : JSON.stringify(request.body);
      if (headers['content-type'] === undefined) {
        headers['content-type'] = 'application/json';
      }
    }

    const upstream = await fetch(target, init);
    const responseHeaders: Record<string, string> = {};
    const hopByHop = new Set([
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailers',
      'transfer-encoding',
      'upgrade',
      'host',
      'content-length',
    ]);
    upstream.headers.forEach((value, key) => {
      if (!hopByHop.has(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    });

    const buffer = Buffer.from(await upstream.arrayBuffer());
    await reply.status(upstream.status).headers(responseHeaders).send(buffer);
  }
}

function ensureTrailingSlash(base: string): string {
  return base.endsWith('/') ? base : `${base}/`;
}
