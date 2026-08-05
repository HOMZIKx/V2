import {
  ActionRowBuilder,
  ComponentType,
  ContainerBuilder,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { describe, expect, it } from 'vitest';

import {
  generateSigningSecret,
  parseSignedCustomId,
} from '../../infrastructure/security/signed-custom-id.js';
import {
  buildStatusEmbed,
  renderDeleteConfirmation,
  renderPanelMessage,
} from './panel-renderer.js';
import { PANEL_TITLE, SELECT_PLACEHOLDER, V2_PANEL_COLORS } from './panel-theme.js';

describe('panel renderer', () => {
  const secret = generateSigningSecret(32);

  it('renders Components V2 container panel without legacy embeds', () => {
    const panel = renderPanelMessage({
      signingSecret: secret,
    });

    expect(panel.flags).toBe(MessageFlags.IsComponentsV2);
    expect(panel.embeds).toBeUndefined();
    expect(panel.content).toBeUndefined();
    expect(panel.files?.length).toBe(1);

    const top = panel.components ?? [];
    expect(top).toHaveLength(1);
    expect(top[0]).toBeInstanceOf(ContainerBuilder);

    const containerJson = (top[0] as ContainerBuilder).toJSON();
    expect(containerJson.type).toBe(ComponentType.Container);
    expect(containerJson.accent_color).toBe(V2_PANEL_COLORS.embed);

    const nested = containerJson.components ?? [];
    const types = nested.map((component) => component.type);
    expect(types).toContain(ComponentType.TextDisplay);
    expect(types).toContain(ComponentType.MediaGallery);
    expect(types).toContain(ComponentType.Separator);
    expect(types.filter((type) => type === ComponentType.ActionRow)).toHaveLength(2);

    const textBlocks = nested.filter((component) => component.type === ComponentType.TextDisplay);
    const header = textBlocks[0];
    expect(header && 'content' in header ? header.content : '').toContain(PANEL_TITLE);
    expect(JSON.stringify(containerJson)).not.toMatch(/\bready\b/);
    expect(JSON.stringify(containerJson)).not.toContain('Wersja panelu');

    const selectRow = nested.find(
      (component) =>
        component.type === ComponentType.ActionRow &&
        Array.isArray(component.components) &&
        component.components.some((child) => child.type === ComponentType.StringSelect),
    );
    expect(selectRow).toBeDefined();
    if (!selectRow || selectRow.type !== ComponentType.ActionRow) {
      throw new Error('expected select action row inside container');
    }
    const select = selectRow.components[0];
    expect(select?.type).toBe(ComponentType.StringSelect);
    if (!select || select.type !== ComponentType.StringSelect) {
      throw new Error('expected string select');
    }
    expect(select.placeholder).toBe(SELECT_PLACEHOLDER);
    expect(parseSignedCustomId(select.custom_id, secret).action).toBe('select');

    const buttonRow = nested.find(
      (component) =>
        component.type === ComponentType.ActionRow &&
        Array.isArray(component.components) &&
        component.components.some((child) => child.type === ComponentType.Button),
    );
    expect(buttonRow).toBeDefined();
    if (!buttonRow || buttonRow.type !== ComponentType.ActionRow) {
      throw new Error('expected button action row inside container');
    }
    expect(buttonRow.components).toHaveLength(2);
  });

  it('builds ephemeral delete confirmation with signed actions', () => {
    const confirmation = renderDeleteConfirmation(secret, '999888777666555444');
    expect(confirmation.flags).toBeDefined();
    const row = confirmation.components?.[0] as ActionRowBuilder & {
      components: Array<{ data: { custom_id?: string } }>;
    };
    const buttons = row.components;
    expect(buttons).toHaveLength(2);
    expect(parseSignedCustomId(buttons[0]?.data.custom_id ?? '', secret).action).toBe(
      'delete_confirm',
    );
  });

  it('builds safe status embed for ephemeral /status only', () => {
    const embed = buildStatusEmbed({
      state: 'ready',
      guildId: '1534228693017432124',
      uptimeSeconds: 12,
      pingMs: 40,
      version: '0.0.0-dev',
      commitSha: 'abc',
      commandsRegistered: true,
    });
    expect(embed).toBeInstanceOf(EmbedBuilder);
    expect(embed.data.title).toBe('V2 LAB • STATUS');
    expect(JSON.stringify(embed.data)).not.toContain('token');
  });
});
