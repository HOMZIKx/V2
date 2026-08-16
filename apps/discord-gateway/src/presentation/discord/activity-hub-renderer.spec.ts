import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';

import { ACTIVITY_HUB_ACCENT, renderActivityHubMessage } from './activity-hub-renderer.js';
import { ACTIVITY_MODULE_ACCENT } from './activity-theme.js';

const secret = 'test-signing-secret-at-least-32-bytes-long!!';
const opaquePanelId = 'a1b2c3d4e5f6';

function toJson(component: unknown): Record<string, unknown> {
  return (component as { toJSON: () => Record<string, unknown> }).toJSON();
}

describe('activity-hub-renderer', () => {
  it('does not import V2 LAB panel-theme and uses Centrum module accent', () => {
    const sourcePath = join(dirname(fileURLToPath(import.meta.url)), 'activity-hub-renderer.ts');
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).not.toContain('panel-theme');
    expect(source).not.toContain('V2_PANEL_COLORS');
    expect(ACTIVITY_HUB_ACCENT).toBe(0xd48632);
    expect(ACTIVITY_HUB_ACCENT).toBe(ACTIVITY_MODULE_ACCENT);
  });

  it('renders Components V2 hub with Section accessories and panelId custom ids', () => {
    const payload = renderActivityHubMessage({ opaquePanelId, signingSecret: secret });
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
    expect(payload.components).toHaveLength(1);
    expect(payload).not.toHaveProperty('embeds');

    const container = toJson(payload.components![0]);
    expect(container.type).toBe(ComponentType.Container);
    expect(container.accent_color).toBe(0xd48632);

    const serialized = JSON.stringify(container);
    expect(serialized).toContain(`:panel:${opaquePanelId}:create`);
    expect(serialized).toContain(`:panel:${opaquePanelId}:lfg`);
    expect(serialized).toContain(`:panel:${opaquePanelId}:mine`);
    expect(serialized).toContain(`:panel:${opaquePanelId}:inbox`);
    expect(serialized.toLowerCase()).not.toContain('zgłoś');
    expect(serialized).not.toContain(':report');
    expect(serialized).not.toContain('ready=true');
    expect(serialized).not.toContain('commit');
    expect(serialized).not.toContain('edytujesz sekcje w dowolnej kolejności');
    expect(serialized).not.toContain('Szybsza publikacja tej samej aktywności');
    expect(serialized).toContain('Utwórz wydarzenie, sprawdź podgląd i opublikuj.');
    expect(serialized).toContain('Szukaj ekipy do wspólnej aktywności.');

    const components = (container.components as Array<Record<string, unknown>>) ?? [];
    const sections = components.filter((c) => c.type === ComponentType.Section);
    expect(sections).toHaveLength(4);
    for (const section of sections) {
      expect(section.accessory).toBeDefined();
      const accessory = section.accessory as Record<string, unknown>;
      expect(accessory.style).toBe(ButtonStyle.Secondary);
      expect(accessory.style).not.toBe(ButtonStyle.Primary);
    }
  });
});
