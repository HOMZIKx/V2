import { describe, expect, it } from 'vitest';

import { inboxKindLabel, isHistoricalLifecycle, lifecycleLabel } from './labels';

describe('lifecycleLabel', () => {
  it('maps known statuses to Polish', () => {
    expect(lifecycleLabel('registrations_open')).toBe('Zapisy otwarte');
    expect(lifecycleLabel('cancelled')).toBe('Anulowana');
    expect(lifecycleLabel('in_progress')).toBe('W trakcie');
    expect(lifecycleLabel('completed')).toBe('Zakończona');
  });

  it('falls back for unknown values', () => {
    expect(lifecycleLabel('mystery')).toBe('mystery');
    expect(lifecycleLabel(undefined)).toBe('Nieznany status');
  });
});

describe('inboxKindLabel', () => {
  it('maps waitlist and reconfirm kinds', () => {
    expect(inboxKindLabel('waitlist')).toBe('Lista rezerwowa');
    expect(inboxKindLabel('waitlist_promoted')).toBe('Awans z rezerwy');
    expect(inboxKindLabel('activity.waitlist_promoted')).toBe('Awans z rezerwy');
    expect(inboxKindLabel('activity.reconfirm_required')).toBe('Ponowne potwierdzenie');
    expect(inboxKindLabel('activity.cancelled')).toBe('Anulowanie');
    expect(inboxKindLabel('activity.participant_removed')).toBe('Usunięto z aktywności');
    expect(inboxKindLabel('reconfirm')).toBe('Ponowne potwierdzenie');
    expect(inboxKindLabel('unknown_kind')).toBe('Powiadomienie');
  });
});

describe('isHistoricalLifecycle', () => {
  it('treats completed and cancelled as historical', () => {
    expect(isHistoricalLifecycle('completed')).toBe(true);
    expect(isHistoricalLifecycle('cancelled')).toBe(true);
    expect(isHistoricalLifecycle('registrations_open')).toBe(false);
  });
});
