import { mkdtempSync, rmSync } from 'node:fs';
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
});
