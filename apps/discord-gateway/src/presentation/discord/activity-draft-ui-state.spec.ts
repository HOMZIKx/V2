import { describe, expect, it } from 'vitest';

import {
  draftPayloadToFormUiState,
  extractDraftFormUiState,
  parseDraftFormUiState,
  signDraftFormUiState,
} from './activity-draft-ui-state.js';
import { renderDraftFormSummary } from './activity-ephemeral-renderer.js';

const secret = 's'.repeat(32);

const sample = {
  name: 'Azrael',
  description: 'Klucz + 4 DPS',
  scheduleFromDisplay: '20.08.2026 18:00',
  scheduleToDisplay: '',
  whenKind: 'exact' as const,
  source: 'create' as const,
};

describe('draft form UI state', () => {
  it('round-trips a signed snapshot', () => {
    const token = signDraftFormUiState(sample, secret);
    expect(parseDraftFormUiState(token, secret)).toEqual(sample);
  });

  it('fails closed on a forged signature', () => {
    const token = signDraftFormUiState(sample, secret);
    const tampered = `${token.slice(0, 12)}ffffffff${token.slice(20)}`;
    expect(parseDraftFormUiState(tampered, secret)).toBeNull();
    expect(parseDraftFormUiState(token, 'other-secret-32-bytes-minimum!!')).toBeNull();
  });

  it('extracts signed state from a rendered preview without HTTP', () => {
    const view = renderDraftFormSummary({
      opaqueDraftId: 'aabbccddeeff',
      signingSecret: secret,
      title: 'Azrael',
      lines: ['**Azrael**', 'Kiedy: 20 sierpnia 2026, 18:00', 'Opis: Klucz + 4 DPS'],
      formState: sample,
    });
    expect(extractDraftFormUiState(view, secret)).toEqual(sample);
  });

  it('maps existing draft payload into modal prefill fields', () => {
    expect(
      draftPayloadToFormUiState({
        name: 'A',
        description: 'B',
        scheduleFromDisplay: 'C',
        scheduleKind: 'exact',
        source: 'create',
      }),
    ).toEqual({
      name: 'A',
      description: 'B',
      scheduleFromDisplay: 'C',
      scheduleToDisplay: '',
      whenKind: 'exact',
      source: 'create',
    });
  });
});
