import { describe, expect, it } from 'vitest';

import { ActivityHttpError } from '../../infrastructure/activity/activity-http-client.js';
import { renderDraftFormSummary } from './activity-ephemeral-renderer.js';
import { ACTIVITY_HUB_ACCENT, renderActivityHubMessage } from './activity-hub-renderer.js';
import { assertNoTechnicalUserCopy, toUserFacingError } from './activity-user-errors.js';
import {
  formatPolishLocalDateTime,
  LocalizedDateParseError,
  parsePolishLocalDateTime,
  zonedLocalToUtc,
} from './localized-datetime.js';
import { V2_PANEL_COLORS } from './panel-theme.js';

describe('localized datetime', () => {
  it('parses Polish local wall time in Europe/Warsaw', () => {
    const date = parsePolishLocalDateTime('20.08.2026 18:00', {
      now: new Date('2026-08-16T12:00:00.000Z'),
    });
    expect(formatPolishLocalDateTime(date)).toBe('20.08.2026 18:00');
    expect(date.toISOString()).toMatch(/^2026-08-20T/);
  });

  it('rejects garbage and invalid calendar values', () => {
    const now = new Date('2026-08-16T12:00:00.000Z');
    expect(() => parsePolishLocalDateTime('DAS12', { now })).toThrow(LocalizedDateParseError);
    expect(() => parsePolishLocalDateTime('abc', { now })).toThrow(LocalizedDateParseError);
    expect(() => parsePolishLocalDateTime('32.15.2026 18:00', { now })).toThrow(
      LocalizedDateParseError,
    );
    expect(() => parsePolishLocalDateTime('20.08.2026 25:00', { now })).toThrow(
      LocalizedDateParseError,
    );
  });

  it('rejects past and beyond horizon', () => {
    const now = new Date('2026-08-16T12:00:00.000Z');
    expect(() => parsePolishLocalDateTime('10.08.2026 18:00', { now })).toThrow(
      LocalizedDateParseError,
    );
    expect(() => parsePolishLocalDateTime('20.09.2026 18:00', { now })).toThrow(
      LocalizedDateParseError,
    );
  });

  it('round-trips zoned conversion for a winter offset sample', () => {
    const utc = zonedLocalToUtc(2026, 1, 15, 12, 0);
    expect(formatPolishLocalDateTime(utc)).toBe('15.01.2026 12:00');
  });
});

describe('user facing errors', () => {
  it('maps 404 without leaking service names', () => {
    const message = toUserFacingError(
      new ActivityHttpError(
        'Activity service rejected request (404)',
        'HTTP',
        404,
        '{"error":{"code":"NOT_FOUND"}}',
      ),
    );
    expect(message.toLowerCase()).not.toContain('activity service');
    expect(message.toLowerCase()).not.toContain('404');
    assertNoTechnicalUserCopy(message);
  });

  it('keeps localized validation copy', () => {
    const message = toUserFacingError(
      new LocalizedDateParseError(
        'Podaj datę i godzinę w formacie DD.MM.RRRR GG:MM (np. 20.08.2026 18:00).',
      ),
    );
    expect(message).toContain('DD.MM.RRRR');
  });
});

describe('hub visual identity', () => {
  it('uses coordinated V2 panel accent (not prototype teal)', () => {
    expect(ACTIVITY_HUB_ACCENT).toBe(V2_PANEL_COLORS.embed);
    expect(ACTIVITY_HUB_ACCENT).toBe(0x7c3aed);
    const payload = renderActivityHubMessage({
      opaquePanelId: 'aabbccddeeff',
      signingSecret: 's'.repeat(32),
    });
    const json = JSON.stringify(payload);
    expect(json).not.toMatch(/one-shot|waitlist|reconfirm|opaque/i);
    expect(json).toContain('Utwórz aktywność');
    expect(json).toContain('lista rezerwowa');
  });
});

describe('draft summary', () => {
  it('exposes section edit actions without technical copy', () => {
    const view = renderDraftFormSummary({
      opaqueDraftId: 'aabbccddeeff',
      signingSecret: 's'.repeat(32),
      lines: ['**Nazwa:** Test'],
    });
    const raw = JSON.stringify(view);
    expect(raw).toContain('Data i godzina');
    expect(raw).toContain('Publikuj');
    expect(raw).not.toMatch(/ISO|opaque|Draft action/i);
  });
});
