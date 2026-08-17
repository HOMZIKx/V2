import { describe, expect, it } from 'vitest';

import { draftPayloadToFormUiState } from './activity-draft-ui-state.js';
import { renderDraftFormSummary } from './activity-ephemeral-renderer.js';

const secret = 's'.repeat(32);

describe('draft form UI state', () => {
  it('does not embed v2dui tokens or serialized form state in preview copy', () => {
    const view = renderDraftFormSummary({
      opaqueDraftId: 'aabbccddeeff',
      signingSecret: secret,
      title: 'Azrael',
      lines: ['**Azrael**', 'Kiedy: 20 sierpnia 2026, 18:00', 'Opis: Klucz + 4 DPS'],
    });
    const json = JSON.stringify(view);
    expect(json).not.toContain('v2dui.v1');
    expect(json).not.toContain('scheduleFromDisplay');
    expect(json).not.toContain('whenKind');
    expect(json).not.toMatch(/"source"\s*:\s*"create"/);
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
