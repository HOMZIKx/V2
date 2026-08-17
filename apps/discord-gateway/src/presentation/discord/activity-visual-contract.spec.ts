import { ComponentType, MessageFlags } from 'discord.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createDraftCustomId } from '../../infrastructure/security/activity-signed-custom-id.js';
import { extractDraftFormUiState } from './activity-draft-ui-state.js';
import { isDraftPreviewMessage, renderDraftFormSummary } from './activity-ephemeral-renderer.js';
import { renderActivityEventMessage } from './activity-event-renderer.js';
import { renderActivityHubMessage } from './activity-hub-renderer.js';
import { ACTIVITY_MODULE_ACCENT } from './activity-theme.js';

const secret = 's'.repeat(32);
const dir = dirname(fileURLToPath(import.meta.url));

function toJson(component: unknown): Record<string, unknown> {
  return (component as { toJSON: () => Record<string, unknown> }).toJSON();
}

describe('Activity Discord visual contract', () => {
  it('keeps hub as one Container with module accent and no Primary buttons', () => {
    const payload = renderActivityHubMessage({
      opaquePanelId: 'aabbccddeeff',
      signingSecret: secret,
    });
    expect(payload.components).toHaveLength(1);
    const container = toJson(payload.components![0]);
    expect(container.type).toBe(ComponentType.Container);
    expect(container.accent_color).toBe(ACTIVITY_MODULE_ACCENT);
    expect(container.accent_color).toBe(0xd48632);
    const json = JSON.stringify(container);
    expect(json).not.toMatch(/"style"\s*:\s*1\b/);
    expect(json).toContain('**DZIAŁAJ**');
    expect(json).toContain('**TWOJE**');
    expect(json).toContain(':panel:aabbccddeeff:create');
    expect(json).toContain(':panel:aabbccddeeff:lfg');
    expect(json).toContain(':panel:aabbccddeeff:mine');
    expect(json).toContain(':panel:aabbccddeeff:inbox');
    expect(json).not.toMatch(
      /components v2|projection|backend|activity-service|opaque id|guild config/i,
    );
    expect(json).not.toMatch(/[\u{1F525}\u{2694}\u{1F409}\u{1F48E}]/u);
  });

  it('does not import V2 LAB from activity renderers', () => {
    for (const file of [
      'activity-hub-renderer.ts',
      'activity-event-renderer.ts',
      'activity-ephemeral-renderer.ts',
      'activity-theme.ts',
    ]) {
      const source = readFileSync(join(dir, file), 'utf8');
      expect(source).not.toMatch(/from ['"].*panel-theme/);
      expect(source).not.toContain('V2_PANEL_COLORS');
    }
  });

  it('uses Activity accent on the public event renderer', () => {
    const payload = renderActivityEventMessage({
      opaqueEventId: 'f6e5d4c3b2a1',
      signingSecret: secret,
      name: 'Azrael',
      typeLabel: 'Dungeon',
      statusLabel: 'Zapisy otwarte',
      startAtIso: '2026-08-20T18:00:00.000Z',
      organizerLabel: 'Alex',
      occupiedSlots: 2,
      participantLimit: 8,
      statusSummaries: [],
      statusDefs: [{ opaqueId: '112233445566', label: 'Będę', occupiesSlot: true }],
    });
    expect(payload.components).toHaveLength(1);
    const container = toJson(payload.components![0]);
    expect(container.accent_color).toBe(0xd48632);
    const json = JSON.stringify(container);
    expect(json).toContain('## Azrael');
    expect(json).not.toContain('opaqueEventId');
    expect(json).not.toContain('statusDef');
  });

  it('keeps preview one-message compatible with signed custom ids', () => {
    const view = renderDraftFormSummary({
      opaqueDraftId: 'aabbccddeeff',
      signingSecret: secret,
      title: 'Azrael',
      lines: ['**20 sierpnia 18:00**', 'Klucz + 4 DPS'],
      formState: {
        name: 'Azrael',
        description: 'Klucz + 4 DPS',
        scheduleFromDisplay: '20.08.2026 18:00',
        scheduleToDisplay: '',
        whenKind: 'exact',
        source: 'create',
      },
    });
    expect(view.components).toHaveLength(1);
    expect(view.flags).toBe(MessageFlags.IsComponentsV2);
    expect(isDraftPreviewMessage({ components: view.components } as never)).toBe(true);
    expect(extractDraftFormUiState(view, secret)?.name).toBe('Azrael');
    const json = JSON.stringify(toJson(view.components![0]));
    expect(json).toContain('Edytuj');
    expect(json).toContain('Publikuj');
    expect(json).toContain(createDraftCustomId('aabbccddeeff', 'edit', secret));
    expect(json).toContain(createDraftCustomId('aabbccddeeff', 'publish', secret));
    const buttons = json.match(/"style"\s*:\s*1\b/g) ?? [];
    expect(buttons).toHaveLength(0);
  });
});
