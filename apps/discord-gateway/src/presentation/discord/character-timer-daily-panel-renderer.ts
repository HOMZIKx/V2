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
  CharacterTimerPanelSnapshot,
  CharacterTimerPanelTimer,
} from '../../infrastructure/player-team/read-character-timer-panel.js';
import { createCharacterTimerButtonCustomId } from '../../infrastructure/security/character-timer-custom-id.js';
import { createCharacterTimerPanelSelectCustomId } from '../../infrastructure/security/character-timer-panel-custom-id.js';

const COLORS = {
  neutral: 0x3b82f6,
  done: 0x2fbf8f,
  warning: 0xe55353,
  ready: 0xef4444,
  muted: 0x667085,
} as const;

function timerIconUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `https://desapp.zeabur.app${path.startsWith('/') ? '' : '/'}${path}`;
}

function readyAtMs(timer: CharacterTimerPanelTimer): number | null {
  if (!timer.readyAtIso) return null;
  const value = Date.parse(timer.readyAtIso);
  return Number.isFinite(value) ? value : null;
}

function timerVisualState(timer: CharacterTimerPanelTimer, nowMs: number): {
  readonly accent: number;
  readonly badge: string;
  readonly buttonStyle: ButtonStyle;
  readonly actionable: boolean;
} {
  const readyMs = readyAtMs(timer);
  const isReady = timer.status === 'ready' || (readyMs !== null && readyMs <= nowMs);
  if (isReady) {
    return { accent: COLORS.ready, badge: '🔴 GOTOWE', buttonStyle: ButtonStyle.Success, actionable: true };
  }
  const remainingMs = readyMs === null ? null : readyMs - nowMs;
  if (remainingMs !== null && remainingMs <= 10 * 60_000) {
    return { accent: COLORS.warning, badge: '🔴 KOŃCZY SIĘ', buttonStyle: ButtonStyle.Success, actionable: false };
  }
  if (timer.status === 'running' && timer.lastConfirmedAt) {
    return { accent: COLORS.done, badge: '🟢 ZROBIONE · CYKL TRWA', buttonStyle: ButtonStyle.Success, actionable: false };
  }
  if (timer.status === 'running') {
    return { accent: COLORS.neutral, badge: '🔵 W TRAKCIE', buttonStyle: ButtonStyle.Success, actionable: false };
  }
  return { accent: COLORS.muted, badge: '⚪ BRAK AKTYWNEGO CYKLU', buttonStyle: ButtonStyle.Secondary, actionable: false };
}

function timerClock(timer: CharacterTimerPanelTimer): string {
  const ms = readyAtMs(timer);
  if (ms === null) return timer.remainingLabel ?? 'Brak czasu zakończenia';
  const unix = Math.floor(ms / 1000);
  return `<t:${unix}:R> · <t:${unix}:t>`;
}

function characterSubtitle(snapshot: CharacterTimerPanelSnapshot): string {
  const character = snapshot.selectedCharacter;
  if (!character) return 'Brak postaci przypisanej do Twojego konta.';
  const parts = [character.characterClass, character.skillPath].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Postać zespołu';
}

export function renderCharacterTimerDailyPanel(input: {
  readonly snapshot: CharacterTimerPanelSnapshot;
  readonly signingSecret: string;
  readonly nowMs?: number;
}): MessageCreateOptions {
  const nowMs = input.nowMs ?? Date.now();
  const snapshot = input.snapshot;
  const components: ContainerBuilder[] = [];

  const header = new ContainerBuilder().setAccentColor(COLORS.neutral);
  header.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## DESTILED · TIMERY\n**${snapshot.selectedCharacter?.name ?? 'Brak postaci'}**\n${characterSubtitle(snapshot)}\n-# ${snapshot.workspaceName} · panel aktualizuje się z tej samej bazy co strona`,
    ),
  );
  components.push(header);

  if (!snapshot.selectedCharacter) {
    const empty = new ContainerBuilder().setAccentColor(COLORS.muted);
    empty.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Nie masz jeszcze postaci przypisanej do swojego konta w tym zespole.'),
    );
    components.push(empty);
  }

  for (const timer of snapshot.timers) {
    const visual = timerVisualState(timer, nowMs);
    const container = new ContainerBuilder().setAccentColor(visual.accent);
    const text = new TextDisplayBuilder().setContent(
      `### ${timer.label}\n${visual.badge}\n**${timerClock(timer)}**${timer.detail ? `\n-# ${timer.detail}` : ''}`,
    );
    const iconUrl = timerIconUrl(timer.iconPath);
    if (iconUrl) {
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(text)
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconUrl)),
      );
    } else {
      container.addTextDisplayComponents(text);
    }
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(
            createCharacterTimerButtonCustomId(
              'gotowe',
              { timerId: timer.id, workspaceId: snapshot.workspaceId },
              input.signingSecret,
            ),
          )
          .setLabel(visual.actionable ? 'Zrobione / oddane' : 'Jeszcze trwa')
          .setStyle(visual.buttonStyle)
          .setDisabled(!visual.actionable),
      ),
    );
    components.push(container);
  }

  if (snapshot.selectedCharacter && snapshot.timers.length === 0) {
    const empty = new ContainerBuilder().setAccentColor(COLORS.muted);
    empty.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('### Brak timerów\nDodaj timer na stronie DESTILED — pojawi się tutaj automatycznie.'),
    );
    components.push(empty);
  }

  const footer = new ContainerBuilder().setAccentColor(COLORS.neutral);
  if (snapshot.characters.length > 1) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(
        createCharacterTimerPanelSelectCustomId(snapshot.workspaceId, input.signingSecret),
      )
      .setPlaceholder('Zmień postać')
      .addOptions(
        snapshot.characters.slice(0, 25).map((character) => ({
          label: character.name.slice(0, 100),
          value: character.id,
          description: [character.characterClass, character.skillPath]
            .filter(Boolean)
            .join(' · ')
            .slice(0, 100) || 'Postać zespołu',
          default: character.id === snapshot.selectedCharacterId,
        })),
      );
    footer.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    );
  }
  footer.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '-# Czas „za X min” jest natywnym timestampem Discorda i odlicza bez wysyłania nowych wiadomości.',
    ),
  );
  components.push(footer);

  return {
    components,
    flags: MessageFlags.IsComponentsV2,
  };
}
