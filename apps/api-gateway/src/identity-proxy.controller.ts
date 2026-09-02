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

import { IDENTITY_SERVICE_BASE_URL } from './activity-proxy.tokens.js';
import { collectUpstreamSetCookies } from './upstream-set-cookie.js';

/**
 * Browser → api-gateway → identity-service. Cookies stay host-only on the
 * public API host so WWW/Admin `/session/me` and OAuth share one cookie jar.
 */
@Controller()
export class IdentityProxyController {
  public constructor(
    @Optional()
    @Inject(IDENTITY_SERVICE_BASE_URL)
    private readonly identityBaseUrl: string | null = null,
  ) {}

  @All(['identity', 'identity/*', 'api/auth', 'api/auth/*'])
  public async proxy(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Headers() incoming: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    if (this.identityBaseUrl === null || this.identityBaseUrl.length === 0) {
      throw new ServiceUnavailableException(
        'IDENTITY_SERVICE_BASE_URL is not configured on api-gateway',
      );
    }

    const target = new URL(request.url, ensureTrailingSlash(this.identityBaseUrl));
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(incoming)) {
      if (value === undefined) {
        continue;
      }
      const lower = key.toLowerCase();
      if (
        lower === 'host' ||
        lower === 'connection' ||
        lower === 'content-length' ||
        lower === 'transfer-encoding'
      ) {
        continue;
      }
      if (
        lower === 'cookie' ||
        lower === 'content-type' ||
        lower === 'accept' ||
        lower === 'accept-language' ||
        lower === 'origin' ||
        lower === 'referer' ||
        lower === 'x-request-id' ||
        lower === 'x-correlation-id' ||
        lower === 'identity-client-assertion'
      ) {
        headers[lower] = Array.isArray(value) ? value.join('; ') : value;
      }
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
        timeout ? 'identity-service request timed out' : 'identity-service is unavailable',
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
      'host',
      'content-length',
    ]);
    const setCookies = collectUpstreamSetCookies(upstream.headers);
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (hopByHop.has(lower) || lower === 'set-cookie') {
        return;
      }
      responseHeaders[key] = value;
    });

    let outgoing = reply.status(upstream.status).headers(responseHeaders);
    if (setCookies.length === 1) {
      outgoing = outgoing.header('set-cookie', setCookies[0]!);
    } else if (setCookies.length > 1) {
      outgoing = outgoing.header('set-cookie', setCookies);
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    await outgoing.send(buffer);
  }
}

function ensureTrailingSlash(base: string): string {
  return base.endsWith('/') ? base : `${base}/`;
}
