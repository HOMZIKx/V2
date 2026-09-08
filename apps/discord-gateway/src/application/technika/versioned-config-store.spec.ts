import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { defaultBotConfigValues } from './capabilities.js';
import {
  RollbackUnavailableError,
  VersionedConfigStore,
} from './versioned-config-store.js';

describe('VersionedConfigStore', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function createStore(clock?: { t: number }): VersionedConfigStore {
    const dir = mkdtempSync(path.join(tmpdir(), 'technika-cfg-'));
    dirs.push(dir);
    return new VersionedConfigStore({
      dataDir: dir,
      now: clock
        ? () => {
            clock.t += 1000;
            return new Date(clock.t);
          }
        : undefined,
    });
  }

  it('starts at revision 1 with defaults', () => {
    const store = createStore();
    const snap = store.getActiveSnapshot();
    expect(snap.revision).toBe(1);
    expect(snap.status).toBe('active');
    expect(snap.config).toEqual(defaultBotConfigValues());
    expect(snap.hasDraft).toBe(false);
    expect(snap.canRollback).toBe(false);
  });

  it('draft → validate → preview → apply increments revision', () => {
    const store = createStore();
    const put = store.putDraft({
      timersNotify: { enabled: true },
    });
    expect(put.ok).toBe(true);
    expect(put.config?.timersNotify.enabled).toBe(true);
    expect(put.config?.timersNotify.reminderMinutesBefore).toBe(60);

    const validation = store.validate();
    expect(validation.ok).toBe(true);

    const preview = store.preview();
    expect(preview.ok).toBe(true);
    expect(preview.wouldBecomeRevision).toBe(2);
    expect(preview.draft?.timersNotify.enabled).toBe(true);

    const applied = store.apply();
    expect(applied.revision).toBe(2);
    expect(applied.config.timersNotify.enabled).toBe(true);
    expect(applied.hasDraft).toBe(false);
    expect(applied.canRollback).toBe(true);
  });

  it('apply is idempotent when no draft', () => {
    const store = createStore();
    store.putDraft({ kingdomWar: { enabled: true, warAt: '18:00' } });
    const first = store.apply();
    expect(first.revision).toBe(2);
    const second = store.apply();
    expect(second.revision).toBe(2);
    expect(second.config.kingdomWar.enabled).toBe(true);
  });

  it('apply is idempotent when draft equals active', () => {
    const store = createStore();
    const active = store.getActiveSnapshot().config;
    store.putDraft(active);
    const applied = store.apply();
    expect(applied.revision).toBe(1);
    expect(applied.hasDraft).toBe(false);
  });

  it('rollback restores previous revision and can roll forward again', () => {
    const store = createStore();
    store.putDraft({
      timersNotify: { enabled: true, reminderMinutesBefore: 45 },
    });
    store.apply();
    expect(store.getActiveSnapshot().config.timersNotify.reminderMinutesBefore).toBe(45);

    const rolled = store.rollback();
    expect(rolled.revision).toBe(3);
    expect(rolled.config.timersNotify.enabled).toBe(false);
    expect(rolled.config.timersNotify.reminderMinutesBefore).toBe(60);

    const again = store.rollback();
    expect(again.revision).toBe(4);
    expect(again.config.timersNotify.reminderMinutesBefore).toBe(45);
  });

  it('rollback without history throws', () => {
    const store = createStore();
    expect(() => store.rollback()).toThrow(RollbackUnavailableError);
  });

  it('rejects secret-like keys and read-only strict-guild-isolation', () => {
    const store = createStore();
    const secrets = store.putDraft({ discordToken: 'nope' } as never);
    expect(secrets.ok).toBe(false);

    const readOnly = store.putDraft({ 'strict-guild-isolation': false } as never);
    expect(readOnly.ok).toBe(false);
  });

  it('validates kingdomWar.warAt as HH:mm', () => {
    const store = createStore();
    const bad = store.putDraft({ kingdomWar: { warAt: '25:99' } });
    expect(bad.ok).toBe(false);

    const good = store.putDraft({
      kingdomWar: {
        enabled: true,
        warAt: '18:00',
        notifyMinutesBefore: 30,
        messageTemplate: 'Wojna o {{warAt}}',
      },
    });
    expect(good.ok).toBe(true);
  });

  it('persists across store re-open', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'technika-cfg-'));
    dirs.push(dir);
    const a = new VersionedConfigStore({ dataDir: dir });
    a.putDraft({ 'panel-test-enabled': false });
    a.apply();
    expect(a.getActiveSnapshot().revision).toBe(2);

    const b = new VersionedConfigStore({ dataDir: dir });
    expect(b.getActiveSnapshot().revision).toBe(2);
    expect(b.getActiveSnapshot().config['panel-test-enabled']).toBe(false);
  });

  it('preserves custom message templates when an older persisted config misses new required fields', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'technika-cfg-'));
    dirs.push(dir);
    const filePath = path.join(dir, 'technika-bot-config.json');
    const legacy = structuredClone(defaultBotConfigValues()) as Record<string, any>;
    legacy.timersNotify.messageTemplate = 'CUSTOM TIMER MESSAGE {{title}}';
    legacy.characterTimers.messageTemplate = 'CUSTOM TIMER MESSAGE {{title}}';
    legacy.kingdomWar.messageTemplate = 'CUSTOM WAR MESSAGE {{warAt}}';
    delete legacy['notify-timer-dm-action-buttons'];
    delete legacy.timersNotify.resetNotifyEnabled;
    delete legacy.characterTimers.resetNotifyEnabled;
    delete legacy.kingdomWar.maxClaimsPerUser;

    writeFileSync(
      filePath,
      `${JSON.stringify({
        revision: 17,
        active: legacy,
        draft: null,
        previous: null,
        updatedAt: '2026-09-08T10:00:00.000Z',
      })}\n`,
      'utf8',
    );

    const store = new VersionedConfigStore({ dataDir: dir });
    const snap = store.getActiveSnapshot();
    expect(snap.revision).toBe(17);
    expect(snap.config.timersNotify.messageTemplate).toBe('CUSTOM TIMER MESSAGE {{title}}');
    expect(snap.config.characterTimers.messageTemplate).toBe('CUSTOM TIMER MESSAGE {{title}}');
    expect(snap.config.kingdomWar.messageTemplate).toBe('CUSTOM WAR MESSAGE {{warAt}}');
    expect(snap.config['notify-timer-dm-action-buttons']).toBe(
      defaultBotConfigValues()['notify-timer-dm-action-buttons'],
    );
    expect(snap.config.timersNotify.resetNotifyEnabled).toBe(
      defaultBotConfigValues().timersNotify.resetNotifyEnabled,
    );
    expect(snap.config.kingdomWar.maxClaimsPerUser).toBe(
      defaultBotConfigValues().kingdomWar.maxClaimsPerUser,
    );

    const upgraded = JSON.parse(readFileSync(filePath, 'utf8')) as {
      revision: number;
      active: ReturnType<typeof defaultBotConfigValues>;
    };
    expect(upgraded.revision).toBe(17);
    expect(upgraded.active.timersNotify.messageTemplate).toBe('CUSTOM TIMER MESSAGE {{title}}');
    expect(upgraded.active['notify-timer-dm-action-buttons']).toBeDefined();
  });

  it('keeps applied custom messages across a real store restart', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'technika-cfg-'));
    dirs.push(dir);
    const a = new VersionedConfigStore({ dataDir: dir });
    const result = a.putDraft({
      characterTimers: { messageTemplate: 'MY SAVED TIMER {{body}}' },
      kingdomWar: { messageTemplate: 'MY SAVED WAR {{warAt}}' },
    });
    expect(result.ok).toBe(true);
    const applied = a.apply();

    const b = new VersionedConfigStore({ dataDir: dir });
    const reopened = b.getActiveSnapshot();
    expect(reopened.revision).toBe(applied.revision);
    expect(reopened.config.characterTimers.messageTemplate).toBe('MY SAVED TIMER {{body}}');
    expect(reopened.config.timersNotify.messageTemplate).toBe('MY SAVED TIMER {{body}}');
    expect(reopened.config.kingdomWar.messageTemplate).toBe('MY SAVED WAR {{warAt}}');
  });

  it('backs up a genuinely invalid persisted file before falling back to defaults', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'technika-cfg-'));
    dirs.push(dir);
    const filePath = path.join(dir, 'technika-bot-config.json');
    const invalidContent = JSON.stringify({
      revision: 9,
      active: { definitelyNotAValidConfig: true },
      draft: null,
      previous: null,
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    writeFileSync(filePath, invalidContent, 'utf8');

    const store = new VersionedConfigStore({ dataDir: dir });
    expect(store.getActiveSnapshot().config).toEqual(defaultBotConfigValues());

    const backups = readdirSync(dir).filter((name) =>
      name.startsWith('technika-bot-config.json.invalid-'),
    );
    expect(backups).toHaveLength(1);
    expect(readFileSync(path.join(dir, backups[0]!), 'utf8')).toBe(invalidContent);
  });
});
