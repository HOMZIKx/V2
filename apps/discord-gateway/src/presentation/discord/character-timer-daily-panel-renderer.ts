import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type MessageCreateOptions,
} from 'discord.js';

import type {
  CharacterTimerPanelCharacter,
  CharacterTimerPanelSnapshot,
  CharacterTimerPanelTimer,
} from '../../infrastructure/player-team/read-character-timer-panel.js';
import { createCharacterTimerButtonCustomId } from '../../infrastructure/security/character-timer-custom-id.js';
import { createCharacterTimerPanelSelectCustomId } from '../../infrastructure/security/character-timer-panel-custom-id.js';

const COLORS = {
  brand: 0x2fbf8f,
  ready: 0xef4444,
  warning: 0xf59e0b,
} as const;
const PANEL_REMINDER_PREFIX = 'panel-';
const FALLBACK_WEB_BASE_URL = 'https://desapp.zeabur.app';
const READY_SOON_MS = 10 * 60_000;
const MAX_TIMER_THUMBNAILS = 4;

const CLASS_LABELS: Readonly<Record<string, string>> = {
  warrior: 'Wojownik',
  ninja: 'Ninja',
  sura: 'Sura',
  shaman: 'Szaman',
  lycan: 'Lykan',
};

const SKILL_LABELS: Readonly<Record<string, string>> = {
  warrior_body: 'Body',
  warrior_mental: 'Mental',
  ninja_blade: 'Sztylety',
  ninja_dagger: 'Sztylety',
  ninja_archery: 'Łuk',
  ninja_archer: 'Łuk',
  sura_weapon: 'WP',
  sura_magic: 'BM',
  sura_black_magic: 'BM',
  shaman_dragon: 'Smok',
  shaman_heal: 'Leczenie',
  shaman_healing: 'Leczenie',
  lycan_instinct: 'Instynkt',
};

function webBaseUrl(): string {
  return (process.env.DESTILED_WEB_BASE_URL ?? FALLBACK_WEB_BASE_URL).replace(/\/$/, '');
}

function assetUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//iu.test(path)) return path;
  return `${webBaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`;
}

export function dailyTimerPanelReminderId(workspaceId: string): string {
  return `${PANEL_REMINDER_PREFIX}${workspaceId}`;
}

export function workspaceIdFromDailyTimerPanelReminderId(timerId: string): string | null {
  if (!timerId.startsWith(PANEL_REMINDER_PREFIX)) return null;
  const workspaceId = timerId.slice(PANEL_REMINDER_PREFIX.length).trim();
  return workspaceId.length > 0 ? workspaceId : null;
}

function readableFallback(value: string): string {
  return value
    .replaceAll('_', ' ')
    .split(/\s+/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ');
}

function characterClassLabel(value: string | null): string | null {
  if (!value) return null;
  return CLASS_LABELS[value] ?? readableFallback(value);
}

function characterSkillLabel(value: string | null): string | null {
  if (!value) return null;
  return SKILL_LABELS[value] ?? readableFallback(value.replace(/^[^_]+_/u, ''));
}

function characterSubtitle(character: CharacterTimerPanelCharacter | null): string {
  if (!character) return 'Przypisz postać do swojego konta w zespole.';
  const parts = [characterClassLabel(character.characterClass), characterSkillLabel(character.skillPath)].filter(
    (value): value is string => Boolean(value),
  );
  return parts.length > 0 ? parts.join(' · ') : 'Postać zespołu';
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

function timerIsEndingSoon(timer: CharacterTimerPanelTimer, nowMs: number): boolean {
  const readyMs = readyAtMs(timer);
  return readyMs !== null && readyMs > nowMs && readyMs - nowMs <= READY_SOON_MS;
}

function timerStatusText(timer: CharacterTimerPanelTimer, nowMs: number): string {
  if (timerIsReady(timer, nowMs)) return '🔴 **GOTOWE**';

  const readyMs = readyAtMs(timer);
  if (timerIsEndingSoon(timer, nowMs) && readyMs !== null) {
    return `🟠 **KOŃCZY SIĘ** · <t:${Math.floor(readyMs / 1000)}:R>`;
  }

  if (timer.status === 'running' && timer.lastConfirmedAt) {
    if (readyMs !== null) {
      return `🟢 **ZROBIONE** · następny <t:${Math.floor(readyMs / 1000)}:R>`;
    }
    return '🟢 **ZROBIONE**';
  }

  if (timer.status === 'running') {
    if (readyMs !== null) {
      return `🔵 **W TRAKCIE** · <t:${Math.floor(readyMs / 1000)}:R>`;
    }
    return timer.remainingLabel ? `🔵 **W TRAKCIE** · ${timer.remainingLabel}` : '🔵 **W TRAKCIE**';
  }

  return '⚪ **BRAK AKTYWNEGO CYKLU**';
}

function panelAccent(snapshot: CharacterTimerPanelSnapshot, nowMs: number): number {
  if (snapshot.timers.some((timer) => timerIsReady(timer, nowMs))) return COLORS.ready;
  if (snapshot.timers.some((timer) => timerIsEndingSoon(timer, nowMs))) return COLORS.warning;
  return COLORS.brand;
}

function timerText(timer: CharacterTimerPanelTimer, nowMs: number): string {
  return `### ${timer.label}\n${timerStatusText(timer, nowMs)}`;
}

function timerPriority(timer: CharacterTimerPanelTimer, nowMs: number): number {
  if (timerIsReady(timer, nowMs)) return 0;
  if (timerIsEndingSoon(timer, nowMs)) return 1;
  if (timer.status === 'running' && timer.lastConfirmedAt) return 2;
  if (timer.status === 'running') return 3;
  return 4;
}

function featuredTimerIds(timers: readonly CharacterTimerPanelTimer[], nowMs: number): ReadonlySet<string> {
  const candidates = timers
    .map((timer, index) => ({ timer, index }))
    .filter(({ timer }) => assetUrl(timer.iconPath) !== null)
    .sort((left, right) => {
      const priorityDelta = timerPriority(left.timer, nowMs) - timerPriority(right.timer, nowMs);
      return priorityDelta !== 0 ? priorityDelta : left.index - right.index;
    })
    .slice(0, MAX_TIMER_THUMBNAILS)
    .map(({ timer }) => timer.id);

  return new Set(candidates);
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

function addCharacterHeader(panel: ContainerBuilder, snapshot: CharacterTimerPanelSnapshot): void {
  const character = snapshot.selectedCharacter;
  const header = new TextDisplayBuilder().setContent(
    `## I DESTILED · TIMERY\n### ${character?.name ?? 'Brak postaci'}\n${characterSubtitle(character)}\n-# Dzisiejszy panel timerów`,
  );
  const imageUrl = assetUrl(character?.imagePath ?? null);

  if (imageUrl) {
    panel.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(header)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(imageUrl)),
    );
    return;
  }

  panel.addTextDisplayComponents(header);
}

function addTimerRows(
  panel: ContainerBuilder,
  timers: readonly CharacterTimerPanelTimer[],
  nowMs: number,
): void {
  const featured = featuredTimerIds(timers, nowMs);
  const compactRows: string[] = [];

  for (const timer of timers) {
    const iconUrl = featured.has(timer.id) ? assetUrl(timer.iconPath) : null;
    if (iconUrl) {
      panel.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(timerText(timer, nowMs)))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconUrl)),
      );
      continue;
    }

    compactRows.push(timerText(timer, nowMs));
  }

  if (compactRows.length > 0) {
    panel.addTextDisplayComponents(new TextDisplayBuilder().setContent(compactRows.join('\n\n')));
  }
}

export function renderCharacterTimerDailyPanel(input: {
  readonly snapshot: CharacterTimerPanelSnapshot;
  readonly signingSecret: string;
  readonly nowMs?: number;
}): MessageCreateOptions {
  const nowMs = input.nowMs ?? Date.now();
  const snapshot = input.snapshot;
  const panel = new ContainerBuilder().setAccentColor(panelAccent(snapshot, nowMs));

  addCharacterHeader(panel, snapshot);

  if (!snapshot.selectedCharacter) {
    panel.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Nie masz jeszcze postaci przypisanej do swojego konta.'),
    );
  } else if (snapshot.timers.length === 0) {
    panel.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('**TIMERY POSTACI**\n⚪ Brak timerów dla tej postaci.'),
    );
  } else {
    panel.addTextDisplayComponents(new TextDisplayBuilder().setContent('**TIMERY POSTACI**'));
    addTimerRows(panel, snapshot.timers, nowMs);
  }

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
      .setPlaceholder(`Postać · ${snapshot.selectedCharacter?.name ?? 'wybierz'}`.slice(0, 150))
      .addOptions(
        snapshot.characters.slice(0, 25).map((character) => ({
          label: character.name.slice(0, 100),
          value: character.id,
          description: characterSubtitle(character).slice(0, 100),
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
  if (minutes % 60 === 0) return `Za ${minutes / 60} godz.`;
  return `Za ${Math.floor(minutes / 60)} godz. ${minutes % 60} min`;
}

export function renderCharacterTimerSnoozePicker(input: {
  readonly workspaceId: string;
  readonly signingSecret: string;
  readonly baseMinutes: number;
}): MessageCreateOptions {
  const panel = new ContainerBuilder().setAccentColor(COLORS.brand);
  const timerId = dailyTimerPanelReminderId(input.workspaceId);

  panel.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '## I DESTILED · TIMERY\n### Przypomnij później\nKiedy ponownie pokazać ten panel?',
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
  const panel = new ContainerBuilder().setAccentColor(COLORS.brand);
  const timerId = dailyTimerPanelReminderId(input.workspaceId);
  const unix = Math.floor(input.fireAtMs / 1000);

  panel.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## I DESTILED · TIMERY\n🔔 **Przypomnienie ustawione**\nPanel wróci <t:${unix}:R>.`,
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
