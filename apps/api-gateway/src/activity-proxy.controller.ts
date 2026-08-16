import {
  All,
  Controller,
  Headers,
  Inject,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ACTIVITY_SERVICE_BASE_URL } from './activity-proxy.tokens.js';

const HOP_BY_HOP = new Set([
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

/**
 * Public BFF proxy: browser/admin → api-gateway → activity-service.
 * Does not interpret Activity domain; forwards identity cookies + actor headers.
 */
@Controller()
export class ActivityProxyController {
  public constructor(
    @Inject(ACTIVITY_SERVICE_BASE_URL) private readonly activityBaseUrl: string | null,
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
      if (value === undefined || HOP_BY_HOP.has(key.toLowerCase())) {
        continue;
      }
      headers[key] = Array.isArray(value) ? value.join(', ') : value;
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
      if (headers['content-type'] === undefined && headers['Content-Type'] === undefined) {
        headers['content-type'] = 'application/json';
      }
    }

    const upstream = await fetch(target, init);
    const responseHeaders: Record<string, string> = {};
    upstream.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key.toLowerCase())) {
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
