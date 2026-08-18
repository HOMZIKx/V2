import { describe, expect, it } from 'vitest';

import {
  loadServiceRegistry,
  summarizeChecks,
  validateFrontendProductionContract,
  validateServiceRegistry,
} from './validate-registry.mjs';

describe('deployable service registry', () => {
  const registry = loadServiceRegistry();

  it('maps every root Dockerfile.<service> and rejects duplicates', () => {
    const checks = validateServiceRegistry(registry);
    expect(summarizeChecks(checks).ok).toBe(true);
    expect(registry.services.map((service: { name: string }) => service.name)).toEqual(
      expect.arrayContaining([
        'authorization-service',
        'identity-service',
        'activity-service',
        'api-gateway',
        'discord-gateway',
        'admin',
        'web',
      ]),
    );
    expect(registry.addons.some((addon: { kind: string }) => addon.kind === 'postgres')).toBe(true);
    expect(registry.addons.some((addon: { kind: string }) => addon.kind === 'redis')).toBe(true);
  });

  it('fails when a Dockerfile is missing from the registry', () => {
    const stripped = {
      ...registry,
      services: registry.services.filter((service: { name: string }) => service.name !== 'admin'),
    };
    const summary = summarizeChecks(validateServiceRegistry(stripped));
    expect(summary.ok).toBe(false);
    expect(summary.checks.some((check) => check.code === 'REGISTRY_MISSING_DOCKERFILE')).toBe(true);
  });

  it('fails when health paths are invalid', () => {
    const broken = {
      ...registry,
      services: registry.services.map((service: { name: string; health: unknown }) =>
        service.name === 'api-gateway' ? { ...service, health: { live: 'health' } } : service,
      ),
    };
    const summary = summarizeChecks(validateServiceRegistry(broken));
    expect(summary.ok).toBe(false);
    expect(summary.checks.some((check) => check.code === 'HEALTH_PATH')).toBe(true);
  });

  it('keeps frontend production API origin fail-closed', () => {
    const summary = summarizeChecks(validateFrontendProductionContract());
    expect(summary.ok).toBe(true);
    expect(summary.checks.map((check) => check.code)).toEqual(
      expect.arrayContaining(['ADMIN_API_BASE', 'WEB_API_BASE']),
    );
  });
});
