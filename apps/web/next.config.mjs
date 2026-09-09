import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';

/** Public backend origin already used by DESTILED Discord OAuth. */
const productionBackendOrigin =
  process.env.V2_BACKEND_PUBLIC_ORIGIN?.trim() || 'https://v2-api.zeabur.app';

/** Identity service origin for server-side rewrites. */
const identityProxyTarget =
  process.env.IDENTITY_PROXY_TARGET?.trim() ||
  (isProduction ? productionBackendOrigin : 'http://127.0.0.1:4200');

/** Activity service. Can be overridden independently on Zeabur. */
const activityProxyTarget =
  process.env.ACTIVITY_PROXY_TARGET?.trim() ||
  (isProduction ? productionBackendOrigin : 'http://127.0.0.1:4400');

/**
 * Discord Gateway (New Bot). Prefer an explicit deployment target; otherwise
 * use the private Zeabur hostname of the dedicated discord-gateway service.
 */
const discordGatewayProxyTarget =
  process.env.DISCORD_GATEWAY_PROXY_TARGET?.trim() ||
  process.env.DISCORD_GATEWAY_BASE_URL?.trim() ||
  (isProduction
    ? 'http://discord-gateway.zeabur.internal:4100'
    : 'http://127.0.0.1:4100');

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(appDirectory, '../..'),
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [
        // DiscordEntry probes /health/live. In production that check belongs to
        // Identity, not to the Next.js process.
        {
          source: '/health/live',
          destination: `${identityProxyTarget}/health/live`,
        },
        // Identity health lives at /health/* on the Identity service, while the
        // browser intentionally stays same-origin under /identity/*.
        {
          source: '/identity/health/:path*',
          destination: `${identityProxyTarget}/health/:path*`,
        },
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
        // /player-team/* is intentionally NOT rewritten directly. It is handled
        // by app/player-team/[...path]/route.ts, which resolves the real Identity
        // session server-side and injects the viewer id only after authentication.
        {
          source: '/discord-gateway/:path*',
          destination: `${discordGatewayProxyTarget}/:path*`,
        },
      ],
      // Existing files under public/game/items/wiki stay static. Only a path that
      // genuinely misses in the filesystem reaches the official-wiki proxy route.
      fallback: [
        {
          source: '/game/items/wiki/:filename',
          destination: '/api/item-images/wiki/:filename',
        },
      ],
    };
  },
};

export default nextConfig;
