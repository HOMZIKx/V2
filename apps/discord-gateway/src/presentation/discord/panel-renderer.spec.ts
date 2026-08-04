import { ActionRowBuilder, EmbedBuilder } from 'discord.js';
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

  it('renders branded panel with select, buttons and banner', () => {
    const panel = renderPanelMessage({
      signingSecret: secret,
      connectionState: 'ready',
      environment: 'test',
    });

    const embed = panel.embeds?.[0];
    expect(embed).toBeInstanceOf(EmbedBuilder);
    if (!(embed instanceof EmbedBuilder)) {
      throw new Error('expected EmbedBuilder');
    }
    expect(embed.data.title).toBe(PANEL_TITLE);
    expect(embed.data.color).toBe(V2_PANEL_COLORS.embed);
    expect(embed.data.footer?.text).toContain('V2 • TEST');
    expect(panel.files?.length).toBe(1);

    const rows = panel.components ?? [];
    expect(rows).toHaveLength(2);
    const selectRow = rows[0];
    expect(selectRow).toBeInstanceOf(ActionRowBuilder);
    const select = (
      selectRow as ActionRowBuilder & {
        components: Array<{ data: { custom_id?: string; placeholder?: string } }>;
      }
    ).components[0];
    expect(select?.data.placeholder).toBe(SELECT_PLACEHOLDER);
    expect(parseSignedCustomId(select?.data.custom_id ?? '', secret).action).toBe('select');
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

  it('builds safe status embed', () => {
    const embed = buildStatusEmbed({
      state: 'ready',
      guildId: '1534228693017432124',
      uptimeSeconds: 12,
      pingMs: 40,
      version: '0.0.0-dev',
      commitSha: 'abc',
      commandsRegistered: true,
    });
    expect(embed.data.title).toBe('V2 LAB • STATUS');
    expect(JSON.stringify(embed.data)).not.toContain('token');
  });
});
