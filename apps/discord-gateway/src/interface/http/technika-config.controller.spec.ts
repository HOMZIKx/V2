import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { VersionedConfigStore } from '../../application/technika/versioned-config-store.js';
import {
  DiscordGatewayConfigSchema,
  normalizeDiscordConfig,
} from '../../infrastructure/discord/discord-config.js';
import { TechnikaCapabilitiesController } from './technika-capabilities.controller.js';
import { TechnikaConfigController } from './technika-config.controller.js';

const SECRET = 'local-technika-secret-16+';

function config(secret = SECRET) {
  return normalizeDiscordConfig(
    DiscordGatewayConfigSchema.parse({
      DISCORD_ENABLED: 'false',
      DISCORD_TECHNIKA_SHARED_SECRET: secret,
      DISCORD_STRICT_GUILD_ISOLATION: 'true',
    }),
  );
}

describe('TechnikaConfigController', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function create(): {
    controller: TechnikaConfigController;
    caps: TechnikaCapabilitiesController;
    store: VersionedConfigStore;
  } {
    const dir = mkdtempSync(path.join(tmpdir(), 'technika-http-'));
    dirs.push(dir);
    const store = new VersionedConfigStore({ dataDir: dir });
    const env = config();
    return {
      store,
      controller: new TechnikaConfigController(env, store, null),
      caps: new TechnikaCapabilitiesController(env),
    };
  }

  it('lists capabilities including timersNotify and kingdomWar without secrets', () => {
    const { caps } = create();
    const body = caps.listCapabilities();
    const ids = body.capabilities.map((c) => c.id as string);
    expect(ids).toContain('timersNotify');
    expect(ids).toContain('kingdomWar');
    expect(ids).toContain('strict-guild-isolation');
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/DISCORD_TOKEN|DISCORD_TECHNIKA_SHARED_SECRET|allowlist/i);
    expect(serialized).not.toContain('sk-');
    const timers = body.capabilities.find((c) => c.id === 'timersNotify') as {
      fields: Array<{ key: string }>;
    };
    expect(timers.fields.map((f) => f.key)).toEqual(
      expect.arrayContaining([
        'enabled',
        'messageTemplate',
        'reminderMinutesBefore',
        'resetNotifyEnabled',
      ]),
    );
  });

  it('rejects mutating calls without secret', () => {
    const { controller } = create();
    expect(() => controller.putDraft(undefined, { timersNotify: { enabled: true } })).toThrow(
      UnauthorizedException,
    );
    expect(() => controller.validate(undefined, {})).toThrow(UnauthorizedException);
    expect(() => controller.preview(undefined)).toThrow(UnauthorizedException);
    expect(() => controller.apply(undefined)).toThrow(UnauthorizedException);
    expect(() => controller.rollback(undefined)).toThrow(UnauthorizedException);
  });

  it('draft → validate → preview → apply → rollback flow', () => {
    const { controller } = create();
    const draft = controller.putDraft(SECRET, {
      config: {
        timersNotify: {
          enabled: true,
          messageTemplate: 'Ping {{title}}',
          reminderMinutesBefore: 60,
          resetNotifyEnabled: true,
        },
        kingdomWar: {
          enabled: true,
          warAt: '18:00',
          notifyMinutesBefore: 30,
          messageTemplate: 'Wojna {{warAt}}',
        },
      },
    });
    expect(draft.ok).toBe(true);

    const validated = controller.validate(SECRET, {});
    expect(validated.ok).toBe(true);

    const preview = controller.preview(SECRET);
    expect(preview.ok).toBe(true);
    expect(preview.wouldBecomeRevision).toBe(2);
    expect(preview.draft?.kingdomWar.notifyMinutesBefore).toBe(30);

    const applied = controller.apply(SECRET);
    expect(applied.ok).toBe(true);
    expect(applied.revision).toBe(2);
    expect(applied.config.timersNotify.enabled).toBe(true);

    const again = controller.apply(SECRET);
    expect(again.revision).toBe(2);

    const rolled = controller.rollback(SECRET);
    expect(rolled.revision).toBe(3);
    expect(rolled.config.timersNotify.enabled).toBe(false);
  });

  it('returns 409 when rollback has no history', () => {
    const { controller } = create();
    expect(() => controller.rollback(SECRET)).toThrow(ConflictException);
  });

  it('rejects invalid draft body', () => {
    const { controller } = create();
    expect(() =>
      controller.putDraft(SECRET, {
        kingdomWar: { warAt: 'noon' },
      }),
    ).toThrow(BadRequestException);
  });

  it('GET active includes strictGuildIsolation display field', () => {
    const { controller } = create();
    const active = controller.getActive();
    expect(active.revision).toBe(1);
    expect(active.strictGuildIsolation).toBe(true);
    expect(active.config.timersNotify.reminderMinutesBefore).toBe(60);
  });
});
