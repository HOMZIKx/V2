import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = path.dirname(fileURLToPath(import.meta.url));

/** Identity service origin for local rewrites (cookies via same host when using relative /identity). */
const identityProxyTarget =
  process.env.IDENTITY_PROXY_TARGET?.trim() || 'http://127.0.0.1:4200';

/** Activity service (P4 Centrum) — OpenAPI default :4400. Local player-team may also use 4400; point ACTIVITY_PROXY_TARGET if ports collide. */
const activityProxyTarget =
  process.env.ACTIVITY_PROXY_TARGET?.trim() || 'http://127.0.0.1:4400';

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(appDirectory, '../..'),
  async rewrites() {
    return [
      {
        source: '/identity/:path*',
        destination: `${identityProxyTarget}/identity/:path*`,
      },
      {
        source: '/api/auth/:path*',
        destination: `${identityProxyTarget}/api/auth/:path*`,
      },
      {
        source: '/activity/:path*',
        destination: `${activityProxyTarget}/activity/:path*`,
      },
    ];
  },
};

export default nextConfig;
