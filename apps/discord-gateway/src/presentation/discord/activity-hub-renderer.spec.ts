import { AttachmentBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createPanelCustomId } from '../../infrastructure/security/activity-signed-custom-id.js';

import { ACTIVITY_HUB_ACCENT, renderActivityHubMessage } from './activity-hub-renderer.js';
import { ACTIVITY_MODULE_ACCENT } from './activity-theme.js';

const secret = 'test-signing-secret-at-least-32-bytes-long!!';
const opaquePanelId = 'a1b2c3d4e5f6';

function toJson(component: unknown): Record<string, unknown> {
  return (component as { toJSON: () => Record<string, unknown> }).toJSON();
}

const DEVELOPER_VOCAB =
  /components v2|draft|projection|modal|backend|activity-service|opaque id|guild config/i;

const RANDOM_EMOJI = /[\u{1F525}\u{2694}\u{1F409}\u{1F48E}]/u;

const ACTION_THUMBNAIL_URLS = [
  'attachment://utworz-wydarzenie-icon.webp',
  'attachment://szukam-ekipy-icon.webp',
  'attachment://moje-aktywnosci-icon.webp',
  'attachment://powiadomienia-icon.webp',
];

describe('activity-hub-renderer', () => {
  it('does not import V2 LAB panel-theme and uses Centrum module accent', () => {
    const sourcePath = join(dirname(fileURLToPath(import.meta.url)), 'activity-hub-renderer.ts');
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).not.toContain('panel-theme');
    expect(source).not.toContain('V2_PANEL_COLORS');
    expect(ACTIVITY_HUB_ACCENT).toBe(0xd48632);
    expect(ACTIVITY_HUB_ACCENT).toBe(ACTIVITY_MODULE_ACCENT);
  });

  it('renders compact hub: one Container, one thumbnail, four Section buttons', () => {
    const payload = renderActivityHubMessage({ opaquePanelId, signingSecret: secret });
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
    expect(payload.components).toHaveLength(1);
    expect(payload).not.toHaveProperty('embeds');
    expect(payload.files).toHaveLength(1);

    const attachmentNames = (payload.files ?? [])
      .filter((file): file is AttachmentBuilder => file instanceof AttachmentBuilder)
      .map((file) => file.name);
    expect(attachmentNames).toEqual(['centrum-aktywnosci-icon.webp']);

    const container = toJson(payload.components![0]);
    expect(container.type).toBe(ComponentType.Container);
    expect(container.accent_color).toBe(0xd48632);

    const serialized = JSON.stringify(container);
    expect(serialized).toContain('**DZIAŁAJ**');
    expect(serialized).toContain('**TWOJE**');
    expect(serialized).toContain(`:panel:${opaquePanelId}:create`);
    expect(serialized).toContain(`:panel:${opaquePanelId}:lfg`);
    expect(serialized).toContain(`:panel:${opaquePanelId}:mine`);
    expect(serialized).toContain(`:panel:${opaquePanelId}:inbox`);
    expect(serialized).toContain('Utwórz');
    expect(serialized).toContain('Szukaj');
    expect(serialized).toContain('Otwórz');
    expect(serialized).toContain('Zaplanuj wydarzenie dla innych.');
    expect(serialized).toContain('Znajdź aktywną ekipę.');
    expect(serialized).toContain('Twoje wydarzenia i zapisy.');
    expect(serialized).toContain('Zmiany, przypomnienia i lista rezerwowa.');
    expect(serialized.toLowerCase()).not.toContain('zgłoś');
    expect(serialized).not.toContain(':report');
    expect(serialized).not.toMatch(DEVELOPER_VOCAB);
    expect(serialized).not.toMatch(RANDOM_EMOJI);
    expect(serialized).not.toContain(String.fromCodePoint(0x1f525));
    expect(serialized).not.toContain('V2 LAB');

    expect(serialized).toContain('attachment://centrum-aktywnosci-icon.webp');
    for (const url of ACTION_THUMBNAIL_URLS) {
      expect(serialized).not.toContain(url);
    }
    expect(serialized).toContain('Centrum Aktywności');
    expect(serialized).toContain('Utwórz aktywność');
    expect(serialized).toContain('Szukam ekipy');
    expect(serialized).toContain('Moje aktywności');
    expect(serialized).toContain('Powiadomienia');

    const components = (container.components as Array<Record<string, unknown>>) ?? [];
    const sections = components.filter((c) => c.type === ComponentType.Section);
    expect(sections).toHaveLength(5);

    const thumbnails = sections.filter((section) => {
      const accessory = section.accessory as Record<string, unknown>;
      return accessory.type === ComponentType.Thumbnail;
    });
    expect(thumbnails).toHaveLength(1);
    expect((thumbnails[0]!.accessory as Record<string, unknown>).media).toEqual(
      expect.objectContaining({
        url: 'attachment://centrum-aktywnosci-icon.webp',
      }),
    );

    const buttonSections = sections.filter((section) => {
      const accessory = section.accessory as Record<string, unknown>;
      return accessory.type === ComponentType.Button;
    });
    expect(buttonSections).toHaveLength(4);

    const buttons = buttonSections.map((section) => section.accessory as Record<string, unknown>);
    for (const button of buttons) {
      expect(button.style).toBe(ButtonStyle.Secondary);
      expect(button.style).not.toBe(ButtonStyle.Primary);
    }
    expect(buttons.map((button) => button.custom_id)).toEqual([
      createPanelCustomId(opaquePanelId, 'create', secret),
      createPanelCustomId(opaquePanelId, 'lfg', secret),
      createPanelCustomId(opaquePanelId, 'mine', secret),
      createPanelCustomId(opaquePanelId, 'inbox', secret),
    ]);

    const actionRows = components.filter((c) => c.type === ComponentType.ActionRow);
    expect(actionRows).toHaveLength(0);

    const separators = components.filter((c) => c.type === ComponentType.Separator);
    expect(separators).toHaveLength(1);
  });

  it('includes exactly one hub header attachment without duplicates', () => {
    const payload = renderActivityHubMessage({ opaquePanelId, signingSecret: secret });
    const names = (payload.files ?? [])
      .filter((file): file is AttachmentBuilder => file instanceof AttachmentBuilder)
      .map((file) => file.name);
    expect(names).toEqual(['centrum-aktywnosci-icon.webp']);
    expect(new Set(names).size).toBe(1);
  });
});
