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
  API_GATEWAY_FORWARD_ACTOR_HEADERS,
  IDENTITY_SERVICE_BASE_URL,
} from './activity-proxy.tokens.js';
import { buildPlayerWorkspaceClientAssertion } from './player-workspace-assertion.js';
import {
  PLAYER_WORKSPACE_ASSERTION_CONFIG,
  PLAYER_WORKSPACE_SERVICE_BASE_URL,
  type PlayerWorkspaceAssertionConfig,
} from './player-workspace-proxy.tokens.js';
import { resolveSessionActor } from './session-actor.resolver.js';

/** Explicit allowlist — never forward Authorization / client assertions / Cookie to PW. */
const FORWARDED_HEADER_ALLOWLIST = new Set([
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
 * Public BFF proxy: browser → api-gateway → player-workspace-service.
 */
@Controller()
export class PlayerWorkspaceProxyController {
  public constructor(
    @Inject(PLAYER_WORKSPACE_SERVICE_BASE_URL) private readonly pwBaseUrl: string | null,
    @Inject(API_GATEWAY_FORWARD_ACTOR_HEADERS)
    private readonly forwardActorHeaders: boolean,
    @Optional()
    @Inject(IDENTITY_SERVICE_BASE_URL)
    private readonly identityBaseUrl: string | null = null,
    @Optional()
    @Inject(PLAYER_WORKSPACE_ASSERTION_CONFIG)
    private readonly pwAssertion: PlayerWorkspaceAssertionConfig | null = null,
  ) {}

  @All(['player-workspace/v1', 'player-workspace/v1/*'])
  public async proxy(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Headers() incoming: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    if (this.pwBaseUrl === null || this.pwBaseUrl.length === 0) {
      throw new ServiceUnavailableException(
        'PLAYER_WORKSPACE_SERVICE_BASE_URL is not configured on api-gateway',
      );
    }

    const target = new URL(request.url, ensureTrailingSlash(this.pwBaseUrl));
    const headers: Record<string, string> = {};
    let browserCookie: string | undefined;
    for (const [key, value] of Object.entries(incoming)) {
      if (value === undefined) {
        continue;
      }
      const lower = key.toLowerCase();
      if (lower === 'cookie') {
        browserCookie = Array.isArray(value) ? value.join('; ') : value;
        continue;
      }
      if (ACTOR_HEADERS.has(lower)) {
        if (!this.forwardActorHeaders) {
          continue;
        }
        if (Array.isArray(value)) {
          continue;
        }
        headers[lower] = value;
        continue;
      }
      if (!FORWARDED_HEADER_ALLOWLIST.has(lower)) {
        continue;
      }
      headers[lower] = Array.isArray(value) ? value.join(', ') : value;
    }

    const sessionActor = await resolveSessionActor(browserCookie, this.identityBaseUrl);
    if (sessionActor !== null) {
      headers['x-actor-discord-user-id'] = sessionActor.discordUserId;
      headers['x-actor-v2-user-id'] = sessionActor.v2UserId;
    }

    if (this.pwAssertion !== null) {
      headers['player-workspace-client-assertion'] = await buildPlayerWorkspaceClientAssertion(
        this.pwAssertion,
        {
          ...(headers['x-actor-discord-user-id'] !== undefined
            ? { discordUserId: headers['x-actor-discord-user-id'] }
            : {}),
          ...(headers['x-actor-v2-user-id'] !== undefined
            ? { v2UserId: headers['x-actor-v2-user-id'] }
            : {}),
        },
      );
    }

    const method = request.method.toUpperCase();
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const init: RequestInit = {
      method,
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
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

    let upstream: Response;
    try {
      upstream = await fetch(target, init);
    } catch (error) {
      const timeout = error instanceof Error && error.name === 'TimeoutError';
      throw new ServiceUnavailableException(
        timeout
          ? 'player-workspace-service request timed out'
          : 'player-workspace-service is unavailable',
      );
    }
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
      'content-encoding',
      'content-length',
    ]);
    upstream.headers.forEach((value, key) => {
      if (!hopByHop.has(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    await reply.status(upstream.status).headers(responseHeaders).send(body);
  }
}

function ensureTrailingSlash(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}
