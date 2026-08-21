import { AttachmentBuilder, ComponentType, MessageFlags } from 'discord.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createPanelCustomId } from '../../infrastructure/security/activity-signed-custom-id.js';
import { isActivityHubAssetAvailable } from './activity-hub-assets.js';
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

describe('activity-hub-renderer', () => {
  it('does not import V2 LAB panel-theme and uses Hub accent', () => {
    const sourcePath = join(dirname(fileURLToPath(import.meta.url)), 'activity-hub-renderer.ts');
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).not.toContain('panel-theme');
    expect(source).not.toContain('V2_PANEL_COLORS');
    expect(source).not.toContain('v2-lab-banner');
    expect(ACTIVITY_HUB_ACCENT).toBe(0xd48632);
    expect(ACTIVITY_HUB_ACCENT).toBe(ACTIVITY_MODULE_ACCENT);
  });

  it('renders V2 Centrum shell with registry-driven StringSelect', () => {
    const payload = renderActivityHubMessage({ opaquePanelId, signingSecret: secret });
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
    expect(payload.components).toHaveLength(1);
    expect(payload).not.toHaveProperty('embeds');

    const bannerPresent = isActivityHubAssetAvailable('activityBanner');
    expect(payload.files).toHaveLength(bannerPresent ? 2 : 1);

    const attachmentNames = (payload.files ?? [])
      .filter((file): file is AttachmentBuilder => file instanceof AttachmentBuilder)
      .map((file) => file.name)
      .sort();
    if (bannerPresent) {
      expect(attachmentNames).toEqual(['centrum-aktywnosci-icon.webp', 'v2-activity-banner.webp']);
    } else {
      expect(attachmentNames).toEqual(['centrum-aktywnosci-icon.webp']);
    }

    const container = toJson(payload.components![0]);
    expect(container.type).toBe(ComponentType.Container);
    expect(container.accent_color).toBe(0xd48632);

    const serialized = JSON.stringify(container);
    expect(serialized).toContain('V2 Centrum');
    expect(serialized).toContain('**Mapa V2**');
    expect(serialized).toContain('**GRA**');
    expect(serialized).toContain('**TY**');
    expect(serialized).toContain('Aktywności');
    expect(serialized).toContain('Mój profil');
    expect(serialized).toContain('Nie wybrano żadnej opcji');
    expect(serialized).toContain(`:panel:${opaquePanelId}:module`);
    expect(serialized).toContain(createPanelCustomId(opaquePanelId, 'module', secret));
    expect(serialized.toLowerCase()).not.toContain('zgłoś');
    expect(serialized).not.toContain(':report');
    expect(serialized).not.toMatch(DEVELOPER_VOCAB);
    expect(serialized).not.toMatch(RANDOM_EMOJI);
    expect(serialized).not.toContain('V2 LAB');

    const components = (container.components as Array<Record<string, unknown>>) ?? [];
    const actionRows = components.filter((c) => c.type === ComponentType.ActionRow);
    expect(actionRows).toHaveLength(1);
    const selectRow = actionRows[0]!;
    const selectComponents = (selectRow.components as Array<Record<string, unknown>>) ?? [];
    expect(selectComponents).toHaveLength(1);
    expect(selectComponents[0]!.type).toBe(ComponentType.StringSelect);
    expect(selectComponents[0]!.custom_id).toBe(
      createPanelCustomId(opaquePanelId, 'module', secret),
    );

    const sections = components.filter((c) => c.type === ComponentType.Section);
    expect(sections.length).toBeGreaterThanOrEqual(1);
    expect(components.filter((c) => c.type === ComponentType.Button)).toHaveLength(0);
  });
});
