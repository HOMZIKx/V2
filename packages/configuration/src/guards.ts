import { z } from 'zod';

export const RuntimeEnvironmentSchema = z.enum(['development', 'test', 'production']);
export type RuntimeEnvironment = z.infer<typeof RuntimeEnvironmentSchema>;

const CONNECTION_ENV_PATTERN = /(DATABASE_URL|REDIS_URL|RABBITMQ_URL|AMQP_URL|BROKER_URL)$/i;

const LOCAL_HOST_PATTERN =
  /^(localhost|127\.0\.0\.1|::1|0\.0\.0\.0|host\.docker\.internal|postgres|redis|rabbitmq)(\.|$)/i;

export function isProduction(environment: RuntimeEnvironment): boolean {
  return environment === 'production';
}

export function isLocalInfrastructureHost(hostname: string): boolean {
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');

  if (LOCAL_HOST_PATTERN.test(normalized)) {
    return true;
  }

  if (normalized.endsWith('.local') || normalized.endsWith('.internal')) {
    return true;
  }

  // RFC1918 and link-local ranges commonly used by Compose/dev networks.
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) {
    return true;
  }
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(normalized)) {
    return true;
  }
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(normalized)) {
    return true;
  }

  return false;
}

export function extractConnectionHosts(
  env: NodeJS.ProcessEnv,
): Array<{ key: string; host: string }> {
  const hosts: Array<{ key: string; host: string }> = [];

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || value.length === 0 || !CONNECTION_ENV_PATTERN.test(key)) {
      continue;
    }

    try {
      const parsed = new URL(value);
      if (parsed.hostname.length > 0) {
        hosts.push({ key, host: parsed.hostname });
      }
    } catch {
      throw new Error(
        `Invalid connection URL in ${key}. Expected a parseable URL for database, Redis, or RabbitMQ.`,
      );
    }
  }

  return hosts;
}

/**
 * Development/test must not silently reach non-local infrastructure.
 * Set ALLOW_PRODUCTION_CONNECTIONS=true only as an explicit, auditable exception.
 */
export function assertNoAccidentalProductionConnections(
  environment: RuntimeEnvironment,
  env: NodeJS.ProcessEnv,
): void {
  if (environment === 'production') {
    return;
  }

  const nonLocalHosts = extractConnectionHosts(env).filter(
    ({ host }) => !isLocalInfrastructureHost(host),
  );

  if (nonLocalHosts.length === 0) {
    return;
  }

  if (env.ALLOW_PRODUCTION_CONNECTIONS === 'true') {
    return;
  }

  const details = nonLocalHosts.map(({ key, host }) => `${key}=${host}`).join(', ');
  throw new Error(
    `Refusing non-local infrastructure hosts outside production (${details}). ` +
      'Use loopback/private/Compose hosts, or set ALLOW_PRODUCTION_CONNECTIONS=true as an explicit exception.',
  );
}

export function assertProductionRequirements(
  environment: RuntimeEnvironment,
  validationSucceeded: boolean,
): void {
  if (isProduction(environment) && !validationSucceeded) {
    throw new Error('Production configuration is invalid or missing required variables.');
  }
}
