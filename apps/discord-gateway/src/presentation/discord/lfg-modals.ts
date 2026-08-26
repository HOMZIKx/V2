import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

import { createModalCustomId } from '../../infrastructure/security/activity-signed-custom-id.js';

export function buildLfgCharacterNickModal(input: {
  opaquePanelId: string;
  signingSecret: string;
  defaultNickname?: string;
}): ModalBuilder {
  const nickInput = new TextInputBuilder()
    .setCustomId('nickname')
    .setLabel('Nick w grze')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(64)
    .setPlaceholder('Np. KuzynBuff');
  if (input.defaultNickname !== undefined && input.defaultNickname.length > 0) {
    nickInput.setValue(input.defaultNickname.slice(0, 64));
  }
  return new ModalBuilder()
    .setCustomId(createModalCustomId('lfg_char_nick', input.opaquePanelId, input.signingSecret))
    .setTitle('Dodaj postać')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(nickInput));
}

export function parseLfgCharacterNickModal(interaction: {
  fields: { getTextInputValue(id: string): string };
}): { nickname: string } {
  return { nickname: interaction.fields.getTextInputValue('nickname').trim() };
}

export function buildLfgCustomTimeModal(input: {
  opaquePanelId: string;
  signingSecret: string;
}): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(createModalCustomId('lfg_time', input.opaquePanelId, input.signingSecret))
    .setTitle('Własne okno czasu')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('date')
          .setLabel('Data (DD.MM.RRRR)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('22.08.2026'),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('from')
          .setLabel('Od (GG:MM)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('18:00'),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('to')
          .setLabel('Do (GG:MM)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('21:00'),
      ),
    );
}

export function buildLfgWatchEditModal(input: {
  opaquePanelId: string;
  signingSecret: string;
  watchId: string;
  sessionRolesLabel?: string;
  windowLabel?: string;
}): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(createModalCustomId('lfg_watch_edit', input.opaquePanelId, input.signingSecret))
    .setTitle('Edytuj poszukiwanie')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('watch_id')
          .setLabel('ID poszukiwania')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(input.watchId),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('session_roles')
          .setLabel('Role (TANK,BUFF,DPS,FLEX)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('TANK,DPS')
          .setValue(input.sessionRolesLabel ?? ''),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('window')
          .setLabel('Okno: data od–do')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('22.08.2026 18:00 – 22.08.2026 21:00')
          .setValue(input.windowLabel ?? ''),
      ),
    );
}

export function parseLfgWatchEditModal(interaction: {
  fields: { getTextInputValue(id: string): string };
}): { watchId: string; sessionRoles: string[]; windowStartRaw: string; windowEndRaw: string } {
  const watchId = interaction.fields.getTextInputValue('watch_id').trim();
  const sessionRoles = interaction.fields
    .getTextInputValue('session_roles')
    .split(',')
    .map((part) => part.trim().toUpperCase())
    .filter((part) => part.length > 0);
  const windowRaw = interaction.fields.getTextInputValue('window').trim();
  const split = windowRaw.split(/\s*[–-]\s*/u);
  if (split.length !== 2) {
    throw new Error('Podaj okno w formacie: DD.MM.RRRR GG:MM – DD.MM.RRRR GG:MM');
  }
  return {
    watchId,
    sessionRoles,
    windowStartRaw: split[0]!.trim(),
    windowEndRaw: split[1]!.trim(),
  };
}

export function parseLfgCustomTimeModal(interaction: {
  fields: { getTextInputValue(id: string): string };
}): { date: string; from: string; to: string } {
  return {
    date: interaction.fields.getTextInputValue('date').trim(),
    from: interaction.fields.getTextInputValue('from').trim(),
    to: interaction.fields.getTextInputValue('to').trim(),
  };
}
