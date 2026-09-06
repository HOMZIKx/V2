import { describe, expect, it, beforeEach } from 'vitest';

import {
  applyMessageTemplate,
  computeNotifyAt,
  getLiveBotConfig,
  patchLiveBotConfig,
  resetLiveBotConfigForTests,
} from './live-bot-config.js';

describe('live bot config', () => {
  beforeEach(() => {
    resetLiveBotConfigForTests();
  });

  it('defaults timersNotify enabled and kingdom war 30 min before 18:00', () => {
    const cfg = getLiveBotConfig();
    expect(cfg.timersNotify.enabled).toBe(true);
    expect(cfg.timersNotify.reminderMinutesBefore).toBe(60);
    expect(cfg.kingdomWar.warAt).toBe('18:00');
    expect(cfg.kingdomWar.notifyMinutesBefore).toBe(30);
    expect(computeNotifyAt(cfg.kingdomWar.warAt, cfg.kingdomWar.notifyMinutesBefore)).toBe(
      '17:30',
    );
  });

  it('patches revision and templates', () => {
    const next = patchLiveBotConfig({
      timersNotify: { enabled: false, messageTemplate: 'Ping {{title}}' },
    });
    expect(next.revision).toBe(1);
    expect(next.timersNotify.enabled).toBe(false);
    expect(applyMessageTemplate(next.timersNotify.messageTemplate, { title: 'X' })).toBe(
      'Ping X',
    );
  });
});
