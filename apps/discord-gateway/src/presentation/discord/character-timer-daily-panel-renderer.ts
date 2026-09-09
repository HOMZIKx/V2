import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  type MessageCreateOptions,
} from 'discord.js';

import type {
  CharacterTimerPanelSnapshot,
  CharacterTimerPanelTimer,
} from '../../infrastructure/player-team/read-character-timer-panel.js';
import { createCharacterTimerButtonCustomId } from '../../infrastructure/security/character-timer-custom-id.js';
import { createCharacterTimerPanelSelectCustomId } from '../../infrastructure/security/character-timer-panel-custom-id.js';

const PANEL_ACCENT = 0x2fbf8f;
const PANEL_REMINDER_PREFIX = 'panel-';
const FALLBACK_WEB_BASE_URL = 'https://desapp.zeabur.app';

function webBaseUrl(): string {
  return (process.env.DESTILED_WEB_BASE_URL ?? FALLBACK_WEB_BASE_URL).replace(/\/$/, '');
}

export function dailyTimerPanelReminderId(workspaceId: string): string {
  return `${PANEL_REMINDER_PREFIX}${workspaceId}`;
}

export function workspaceIdFromDailyTimerPanelReminderId(timerId: string): string | null {
  if (!timerId.startsWith(PANEL_REMINDER_PREFIX)) return null;
  const workspaceId = timerId.slice(PANEL_REMINDER_PREFIX.length).trim();
  return workspaceId.length > 0 ? workspaceId : null;
}

function readyAtMs(timer: CharacterTimerPanelTimer): number | null {
  if (!timer.readyAtIso) return null;
  const value = Date.parse(timer.readyAtIso);
  return Number.isFinite(value) ? value : null;
}

function timerIsReady(timer: CharacterTimerPanelTimer, nowMs: number): boolean {
  const readyMs = readyAtMs(timer);
  return timer.status === 'ready' || (readyMs !== null && readyMs <= nowMs);
}

function timerStatusText(timer: CharacterTimerPanelTimer, nowMs: number): string {
  if (timerIsReady(timer, nowMs)) return '🟢 **gotowe**';

  const readyMs = readyAtMs(timer);
  if (readyMs !== null) {
    const unix = Math.floor(readyMs / 1000);
    return `🟡 <t:${unix}:R>`;
  }

  if (timer.status === 'running') {
    return timer.remainingLabel ? `🟡 ${timer.remainingLabel}` : '🟡 w trakcie';
  }

  return '⚪ brak aktywnego cyklu';
}

function timerSummary(snapshot: CharacterTimerPanelSnapshot, nowMs: number): string {
  if (!snapshot.selectedCharacter) {
    return 'Nie masz jeszcze postaci przypisanej do swojego konta w tym zespole.';
  }
  if (snapshot.timers.length === 0) {
    return 'Brak timerów dla tej postaci.';
  }

  return snapshot.timers
    .map((timer) => `**${timer.label}** — ${timerStatusText(timer, nowMs)}`)
    .join('\n');
}

function buttonLabel(prefix: string, value: string): string {
  const maxValueLength = Math.max(1, 80 - prefix.length);
  return `${prefix}${value.slice(0, maxValueLength)}`;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function openTimersButton(): ButtonBuilder {
  return new ButtonBuilder()
    .setLabel('Otwórz timery')
    .setStyle(ButtonStyle.Link)
    .setURL(`${webBaseUrl()}/timers`);
}

export function renderCharacterTimerDailyPanel(input: {
  readonly snapshot: CharacterTimerPanelSnapshot;
  readonly signingSecret: string;
  readonly nowMs?: number;
}): MessageCreateOptions {
  const nowMs = input.nowMs ?? Date.now();
  const snapshot = input.snapshot;
  const panel = new ContainerBuilder().setAccentColor(PANEL_ACCENT);

  panel.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## DESTILED · TIMERY\n**${snapshot.selectedCharacter?.name ?? 'Brak postaci'}**\n-# Dzisiejsze timery`,
    ),
  );

  panel.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(timerSummary(snapshot, nowMs)),
  );

  const readyTimers = snapshot.timers.filter((timer) => timerIsReady(timer, nowMs));
  for (const group of chunk(readyTimers, 5)) {
    panel.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        group.map((timer) =>
          new ButtonBuilder()
            .setCustomId(
              createCharacterTimerButtonCustomId(
                'gotowe',
                { timerId: timer.id },
                input.signingSecret,
              ),
            )
            .setLabel(buttonLabel('Zrobione · ', timer.label))
            .setStyle(ButtonStyle.Success),
        ),
      ),
    );
  }

  if (snapshot.characters.length > 1) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(
        createCharacterTimerPanelSelectCustomId(snapshot.workspaceId, input.signingSecret),
      )
      .setPlaceholder(`Postać: ${snapshot.selectedCharacter?.name ?? 'wybierz'}`.slice(0, 150))
      .addOptions(
        snapshot.characters.slice(0, 25).map((character) => ({
          label: character.name.slice(0, 100),
          value: character.id,
          default: character.id === snapshot.selectedCharacterId,
        })),
      );
    panel.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    );
  }

  panel.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      openTimersButton(),
      new ButtonBuilder()
        .setCustomId(
          createCharacterTimerButtonCustomId(
            'przypomnij',
            { timerId: dailyTimerPanelReminderId(snapshot.workspaceId) },
            input.signingSecret,
          ),
        )
        .setLabel('Przypomnij później')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return {
    components: [panel],
    flags: MessageFlags.IsComponentsV2,
  };
}

function normalizedReminderOptions(baseMinutes: number): number[] {
  const base = Math.max(5, Math.min(360, Math.round(baseMinutes)));
  return [...new Set([base, base * 2, base * 4].map((value) => Math.min(1_440, value)))];
}

function reminderLabel(minutes: number): string {
  if (minutes < 60) return `Za ${minutes} min`;
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `Za ${hours} ${hours === 1 ? 'godz.' : 'godz.'}`;
  }
  return `Za ${Math.floor(minutes / 60)} godz. ${minutes % 60} min`;
}

export function renderCharacterTimerSnoozePicker(input: {
  readonly workspaceId: string;
  readonly signingSecret: string;
  readonly baseMinutes: number;
}): MessageCreateOptions {
  const panel = new ContainerBuilder().setAccentColor(PANEL_ACCENT);
  const timerId = dailyTimerPanelReminderId(input.workspaceId);

  panel.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '## DESTILED · TIMERY\n**Przypomnij później**\nKiedy mam ponownie podbić ten panel?',
    ),
  );

  panel.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      normalizedReminderOptions(input.baseMinutes).map((minutes) =>
        new ButtonBuilder()
          .setCustomId(
            createCharacterTimerButtonCustomId(
              'przypomnij',
              { timerId, snoozeMinutes: minutes },
              input.signingSecret,
            ),
          )
          .setLabel(reminderLabel(minutes))
          .setStyle(ButtonStyle.Primary),
      ),
    ),
  );

  panel.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      openTimersButton(),
      new ButtonBuilder()
        .setCustomId(
          createCharacterTimerButtonCustomId(
            'przypomnij',
            { timerId, snoozeMinutes: 0 },
            input.signingSecret,
          ),
        )
        .setLabel('Wróć')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return { components: [panel], flags: MessageFlags.IsComponentsV2 };
}

export function renderCharacterTimerSnoozeConfirmation(input: {
  readonly workspaceId: string;
  readonly signingSecret: string;
  readonly fireAtMs: number;
}): MessageCreateOptions {
  const panel = new ContainerBuilder().setAccentColor(PANEL_ACCENT);
  const timerId = dailyTimerPanelReminderId(input.workspaceId);
  const unix = Math.floor(input.fireAtMs / 1000);

  panel.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## DESTILED · TIMERY\n🔔 **Przypomnienie ustawione**\nPanel wróci <t:${unix}:R>.`,
    ),
  );
  panel.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      openTimersButton(),
      new ButtonBuilder()
        .setCustomId(
          createCharacterTimerButtonCustomId(
            'przypomnij',
            { timerId, snoozeMinutes: 0 },
            input.signingSecret,
          ),
        )
        .setLabel('Wróć do panelu')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return { components: [panel], flags: MessageFlags.IsComponentsV2 };
}
