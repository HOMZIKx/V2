import { describe, expect, it } from 'vitest';

import { ActivityHttpError } from '../../infrastructure/activity/activity-http-client.js';
import { renderDraftFormSummary } from './activity-ephemeral-renderer.js';
import { ACTIVITY_HUB_ACCENT, renderActivityHubMessage } from './activity-hub-renderer.js';
import { ACTIVITY_MODULE_ACCENT } from './activity-theme.js';
import { assertNoTechnicalUserCopy, toUserFacingError } from './activity-user-errors.js';
import {
  formatPolishLocalDateTime,
  LocalizedDateParseError,
  parsePolishLocalDateTime,
  zonedLocalToUtc,
} from './localized-datetime.js';

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
  it('uses V2 Centrum shell accent decoupled from V2 LAB purple', () => {
    expect(ACTIVITY_HUB_ACCENT).toBe(ACTIVITY_MODULE_ACCENT);
    expect(ACTIVITY_HUB_ACCENT).toBe(0xd48632);
    expect(ACTIVITY_HUB_ACCENT).not.toBe(0x7c3aed);
    const payload = renderActivityHubMessage({
      opaquePanelId: 'aabbccddeeff',
      signingSecret: 's'.repeat(32),
    });
    const json = JSON.stringify(payload);
    expect(json).not.toMatch(/one-shot|waitlist|reconfirm|opaque/i);
    expect(json).toContain('V2 Centrum');
    expect(json).toContain('**GRA**');
    expect(json).toContain('Szukam ekipy');
    expect(json).toContain('Mój profil');
    expect(json).toContain('Wybierz działanie');
    expect(json).not.toContain('**Mapa V2**');
    expect(json).not.toContain('edytujesz sekcje w dowolnej kolejności');
    expect(json).not.toContain('Szybsza publikacja tej samej aktywności');
    expect(json).not.toContain('v2-lab-banner');
    expect(json).not.toMatch(/ButtonStyle\.Primary|"style":1/);
  });
});

describe('draft summary', () => {
  it('exposes Edit/Publish/Cancel without sectional wizard copy', () => {
    const view = renderDraftFormSummary({
      opaqueDraftId: 'aabbccddeeff',
      signingSecret: 's'.repeat(32),
      lines: ['**Nazwa:** Test', 'Kiedy: W tym tygodniu'],
    });
    const visible = JSON.stringify(view.components?.[0]);
    expect(visible).toContain('Edytuj');
    expect(visible).toContain('Publikuj');
    expect(visible).toContain('Anuluj');
    expect(visible).not.toContain('Data i godzina');
    expect(visible).not.toContain('Nazwa i opis');
    expect(visible).not.toMatch(/ISO|Draft action|scheduleKind|periodKey/i);
  });
});
