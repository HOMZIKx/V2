import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readSource(relativePath: string): string {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

describe('P4 current production fail-closed controls', () => {
  it('rejects ACTIVITY_TRUST_ACTOR_HEADERS and test seed in production', () => {
    const source = readSource(
      'services/activity-service/src/infrastructure/config/activity-env.ts',
    );
    expect(source).toContain(
      "throw new ActivityConfigError('ACTIVITY_TRUST_ACTOR_HEADERS cannot be enabled in production')",
    );
    expect(source).toContain(
      "throw new ActivityConfigError('ACTIVITY_ALLOW_TEST_SEED cannot be enabled in production')",
    );
    expect(source).toContain(
      'ACTIVITY_REDIS_URL is required in production when inbound client assertions are configured',
    );
  });

  it('uses DenyAll authorization in production when activity is disabled', () => {
    const source = readSource(
      'services/activity-service/src/infrastructure/authorization/authorization-client.ts',
    );
    expect(source).toContain('export class DenyAllAuthorizationClient');
    expect(source).toContain("config.NODE_ENV === 'production'");
    expect(source).toContain('return new DenyAllAuthorizationClient()');
  });

  it('never forwards browser actor headers in production', () => {
    const source = readSource('apps/api-gateway/src/forward-actor-headers.ts');
    expect(source).toContain("(env.NODE_ENV ?? '').trim() === 'production'");
    expect(source).toContain('return false');
  });

  it('compares Discord projection secrets in constant time', () => {
    const source = readSource(
      'apps/discord-gateway/src/infrastructure/messaging/activity-projection-delivery.service.ts',
    );
    expect(source).toContain('timingSafeEqualUtf8(projectionSecret, expected)');
  });
});
