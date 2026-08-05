import { redisStorage } from '@better-auth/redis-storage';
import { betterAuth } from 'better-auth';
import { Redis } from 'ioredis';
import { Pool } from 'pg';

import { buildSyntheticEmail } from '../../domain/synthetic-email.js';
import type { IdentityEnv } from '../config/identity-env.js';

const REDIS_KEY_PREFIX = 'v2:identity:auth:';

/** Concrete inferred runtime returned by {@link createBetterAuth}. */
export type AuthRuntime = ReturnType<typeof createBetterAuth>;

/** The Better Auth engine instance with its concrete inferred option types. */
export type BetterAuthInstance = AuthRuntime['auth'];

/**
 * Strip every raw provider token from an account row before it is persisted.
 *
 * V2 never calls Discord/Google APIs after login, so access/refresh/id tokens
 * are not stored at all (primary path). `encryptOAuthTokens: true` remains set
 * as defense-in-depth for any token that a future flow might reintroduce.
 */
export const stripProviderTokens = <T extends Record<string, unknown>>(
  account: T,
): { data: T } => ({
  data: {
    ...account,
    accessToken: null,
    refreshToken: null,
    idToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
  },
});

interface MappableDiscordProfile {
  readonly id: string;
  readonly username?: string;
  readonly global_name?: string | null;
  readonly email?: string | null;
}

/**
 * Map a Discord profile to a V2 user. When Discord returns no email we mint a
 * deterministic synthetic address so login still creates a stable V2 user keyed
 * on the provider account id. `emailVerified` is always false: neither a real
 * nor a synthetic Discord email is treated as verified for V2.
 */
export function mapDiscordProfileToUser(profile: MappableDiscordProfile): {
  name: string;
  email: string;
  emailVerified: boolean;
} {
  const email = profile.email == null ? buildSyntheticEmail('discord', profile.id) : profile.email;
  return {
    name: profile.global_name ?? profile.username ?? profile.id,
    email,
    emailVerified: false,
  };
}

/**
 * Build the Better Auth engine for the Identity Service. All engine wiring
 * (PostgreSQL pool, Redis secondary storage, providers, linking policy) lives
 * here in infrastructure; nothing above this layer imports Better Auth.
 *
 * Caller must have validated {@link IdentityEnv} with auth enabled: the required
 * fields below are asserted non-null by config validation before this runs.
 */
export function createBetterAuth(config: IdentityEnv) {
  const isProduction = config.NODE_ENV === 'production';

  const pool = new Pool({ connectionString: config.IDENTITY_DATABASE_URL });
  const redis = new Redis(config.IDENTITY_REDIS_URL, { maxRetriesPerRequest: null });

  const auth = betterAuth({
    appName: 'v2-identity',
    database: pool,
    baseURL: config.IDENTITY_AUTH_BASE_URL,
    basePath: config.IDENTITY_AUTH_BASE_PATH,
    secret: config.IDENTITY_BETTER_AUTH_SECRET,
    trustedOrigins: [...config.IDENTITY_TRUSTED_ORIGINS],
    emailAndPassword: { enabled: false },
    advanced: {
      // Always mint UUIDs in JS. The string option `"uuid"` skips JS generation when
      // the driver reports native UUID support, but our TEXT PKs have no DB default.
      database: { generateId: () => crypto.randomUUID() },
      useSecureCookies: isProduction,
      cookiePrefix: config.IDENTITY_COOKIE_PREFIX,
    },
    session: {
      storeSessionInDatabase: false,
      cookieCache: { enabled: false },
    },
    account: {
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        allowDifferentEmails: true,
        allowUnlinkingAll: false,
        updateUserInfoOnLink: false,
      },
      encryptOAuthTokens: true,
    },
    socialProviders: {
      discord: {
        clientId: config.IDENTITY_DISCORD_CLIENT_ID ?? '',
        clientSecret: config.IDENTITY_DISCORD_CLIENT_SECRET ?? '',
        mapProfileToUser: (profile) => mapDiscordProfileToUser(profile),
      },
      google: {
        clientId: config.IDENTITY_GOOGLE_CLIENT_ID ?? '',
        clientSecret: config.IDENTITY_GOOGLE_CLIENT_SECRET ?? '',
        scope: ['openid', 'email', 'profile'],
      },
    },
    secondaryStorage: redisStorage({ client: redis, keyPrefix: REDIS_KEY_PREFIX }),
    databaseHooks: {
      account: {
        create: { before: (account) => Promise.resolve(stripProviderTokens(account)) },
        update: { before: (account) => Promise.resolve(stripProviderTokens(account)) },
      },
    },
  });

  const close = async (): Promise<void> => {
    await pool.end().catch(() => undefined);
    redis.disconnect();
  };

  return { auth, pool, redis, close };
}

export { REDIS_KEY_PREFIX };
