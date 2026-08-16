/**
 * Discord create/edit schedule parsing for Centrum Aktywności.
 * Resolves UX „Kiedy?” into canonical schedule fields for activity-service.
 */
import {
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ModalSubmitInteraction,
} from 'discord.js';

import { createModalCustomId } from '../../infrastructure/security/activity-signed-custom-id.js';
import {
  formatPolishLocalDateTime,
  LocalizedDateParseError,
  parsePolishLocalDateTime,
  zonedLocalToUtc,
} from './localized-datetime.js';

export const GUILD_TIMEZONE = 'Europe/Warsaw';

export type ScheduleKind = 'exact' | 'range' | 'flexible_period';
export type PeriodKey = 'today' | 'tomorrow' | 'this_week' | 'weekend' | 'flexible';

export type WhenKind =
  'exact' | 'range' | 'today' | 'tomorrow' | 'this_week' | 'weekend' | 'flexible';

export type ResolvedActivitySchedule = {
  scheduleKind: ScheduleKind;
  periodKey: PeriodKey | null;
  startAt: Date;
  endAt: Date | null;
  scheduleHasExplicitTime: boolean;
  scheduleLabel: string;
};

const WHEN_OPTIONS: ReadonlyArray<{ value: WhenKind; label: string; description: string }> = [
  { value: 'exact', label: 'Dokładny termin', description: 'Konkretna data i godzina' },
  { value: 'range', label: 'Przedział OD–DO', description: 'Od … do …' },
  { value: 'today', label: 'Dzisiaj', description: 'Opcjonalnie godziny w polach OD/DO' },
  { value: 'tomorrow', label: 'Jutro', description: 'Opcjonalnie godziny w polach OD/DO' },
  { value: 'this_week', label: 'W tym tygodniu', description: 'Bez wymuszania daty' },
  { value: 'weekend', label: 'W weekend', description: 'Sobota–niedziela (czas lokalny)' },
  { value: 'flexible', label: 'Do ustalenia', description: 'Elastyczny termin' },
];

const TIME_ONLY_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const POLISH_MONTHS = [
  'stycznia',
  'lutego',
  'marca',
  'kwietnia',
  'maja',
  'czerwca',
  'lipca',
  'sierpnia',
  'września',
  'października',
  'listopada',
  'grudnia',
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function readZonedParts(
  date: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  isoWeekday: number;
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  const map: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  const hourRaw = map.hour === '24' ? '0' : (map.hour ?? '0');
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(hourRaw),
    minute: Number(map.minute ?? '0'),
    isoWeekday: weekdayMap[map.weekday ?? 'Mon'] ?? 1,
  };
}

function addDays(
  day: { year: number; month: number; day: number },
  days: number,
): { year: number; month: number; day: number } {
  const utc = new Date(Date.UTC(day.year, day.month - 1, day.day + days));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

function startOfDay(day: { year: number; month: number; day: number }, tz: string): Date {
  return zonedLocalToUtc(day.year, day.month, day.day, 0, 0, tz);
}

function endOfDay(day: { year: number; month: number; day: number }, tz: string): Date {
  return new Date(startOfDay(addDays(day, 1), tz).getTime() - 1);
}

function parseTimeOnly(raw: string): { hour: number; minute: number } {
  const match = TIME_ONLY_RE.exec(raw.trim());
  if (match === null) {
    throw new LocalizedDateParseError('Podaj godzinę w formacie GG:MM (np. 18:00).');
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function isTimeOnly(raw: string): boolean {
  return TIME_ONLY_RE.test(raw.trim());
}

function formatRangeLabel(start: Date, end: Date, tz: string): string {
  const a = readZonedParts(start, tz);
  const b = readZonedParts(end, tz);
  const month = POLISH_MONTHS[a.month - 1] ?? String(a.month);
  const sameDay = a.year === b.year && a.month === b.month && a.day === b.day;
  if (sameDay) {
    return `${a.day} ${month}, ${pad2(a.hour)}:${pad2(a.minute)}–${pad2(b.hour)}:${pad2(b.minute)}`;
  }
  return `${formatPolishLocalDateTime(start, tz)} → ${formatPolishLocalDateTime(end, tz)}`;
}

function formatExactLabel(start: Date, tz: string): string {
  const p = readZonedParts(start, tz);
  const month = POLISH_MONTHS[p.month - 1] ?? String(p.month);
  return `${p.day} ${month} ${p.year}, ${pad2(p.hour)}:${pad2(p.minute)}`;
}

function applyDayTimes(
  day: { year: number; month: number; day: number },
  tz: string,
  fromRaw: string,
  toRaw: string,
): { startAt: Date; endAt: Date; hasExplicitTime: boolean } {
  if (!fromRaw && !toRaw) {
    return { startAt: startOfDay(day, tz), endAt: endOfDay(day, tz), hasExplicitTime: false };
  }
  const from = fromRaw ? parseTimeOnly(fromRaw) : { hour: 0, minute: 0 };
  const to = toRaw ? parseTimeOnly(toRaw) : { hour: 23, minute: 59 };
  const startAt = zonedLocalToUtc(day.year, day.month, day.day, from.hour, from.minute, tz);
  const endAt = zonedLocalToUtc(day.year, day.month, day.day, to.hour, to.minute, tz);
  if (endAt.getTime() < startAt.getTime()) {
    throw new LocalizedDateParseError('Godzina DO nie może być wcześniejsza niż OD.');
  }
  return { startAt, endAt, hasExplicitTime: true };
}

export function resolveWhenKindSchedule(input: {
  whenKind: WhenKind;
  fromRaw: string;
  toRaw: string;
  now?: Date;
  timeZone?: string;
}): ResolvedActivitySchedule {
  const tz = input.timeZone ?? GUILD_TIMEZONE;
  const now = input.now ?? new Date();
  const fromRaw = input.fromRaw.trim();
  const toRaw = input.toRaw.trim();
  const local = readZonedParts(now, tz);
  const today = { year: local.year, month: local.month, day: local.day };

  switch (input.whenKind) {
    case 'exact': {
      if (!fromRaw) {
        throw new LocalizedDateParseError(
          'Dla dokładnego terminu uzupełnij pole OD (np. 20.08.2026 18:00).',
        );
      }
      if (isTimeOnly(fromRaw)) {
        throw new LocalizedDateParseError(
          'Dla dokładnego terminu podaj pełną datę i godzinę w polu OD.',
        );
      }
      const startAt = parsePolishLocalDateTime(fromRaw, { now, timeZone: tz });
      const endAt =
        toRaw.length > 0
          ? isTimeOnly(toRaw)
            ? (() => {
                const t = parseTimeOnly(toRaw);
                const p = readZonedParts(startAt, tz);
                return zonedLocalToUtc(p.year, p.month, p.day, t.hour, t.minute, tz);
              })()
            : parsePolishLocalDateTime(toRaw, { now, timeZone: tz })
          : null;
      if (endAt !== null && endAt.getTime() < startAt.getTime()) {
        throw new LocalizedDateParseError('Koniec nie może być wcześniejszy niż początek.');
      }
      return {
        scheduleKind: 'exact',
        periodKey: null,
        startAt,
        endAt,
        scheduleHasExplicitTime: true,
        scheduleLabel: formatExactLabel(startAt, tz),
      };
    }
    case 'range': {
      if (!fromRaw || !toRaw) {
        throw new LocalizedDateParseError('Dla przedziału uzupełnij pola OD i DO.');
      }
      const startAt = parsePolishLocalDateTime(fromRaw, { now, timeZone: tz });
      const endAt = parsePolishLocalDateTime(toRaw, { now, timeZone: tz });
      if (endAt.getTime() < startAt.getTime()) {
        throw new LocalizedDateParseError('Koniec nie może być wcześniejszy niż początek.');
      }
      return {
        scheduleKind: 'range',
        periodKey: null,
        startAt,
        endAt,
        scheduleHasExplicitTime: true,
        scheduleLabel: formatRangeLabel(startAt, endAt, tz),
      };
    }
    case 'today': {
      const resolved = applyDayTimes(today, tz, fromRaw, toRaw);
      if (resolved.endAt.getTime() <= now.getTime()) {
        throw new LocalizedDateParseError('Dzisiejszy termin już się skończył.');
      }
      const label = resolved.hasExplicitTime
        ? `Dzisiaj, ${pad2(readZonedParts(resolved.startAt, tz).hour)}:${pad2(readZonedParts(resolved.startAt, tz).minute)}–${pad2(readZonedParts(resolved.endAt, tz).hour)}:${pad2(readZonedParts(resolved.endAt, tz).minute)}`
        : 'Dzisiaj';
      return {
        scheduleKind: 'flexible_period',
        periodKey: 'today',
        ...resolved,
        scheduleHasExplicitTime: resolved.hasExplicitTime,
        scheduleLabel: label,
      };
    }
    case 'tomorrow': {
      const day = addDays(today, 1);
      const resolved = applyDayTimes(day, tz, fromRaw, toRaw);
      const label = resolved.hasExplicitTime
        ? `Jutro, ${pad2(readZonedParts(resolved.startAt, tz).hour)}:${pad2(readZonedParts(resolved.startAt, tz).minute)}–${pad2(readZonedParts(resolved.endAt, tz).hour)}:${pad2(readZonedParts(resolved.endAt, tz).minute)}`
        : 'Jutro';
      return {
        scheduleKind: 'flexible_period',
        periodKey: 'tomorrow',
        ...resolved,
        scheduleHasExplicitTime: resolved.hasExplicitTime,
        scheduleLabel: label,
      };
    }
    case 'this_week': {
      if (fromRaw || toRaw) {
        throw new LocalizedDateParseError(
          'Dla „W tym tygodniu” zostaw pola OD/DO puste (albo wybierz dokładny termin).',
        );
      }
      const monday = addDays(today, -(local.isoWeekday - 1));
      const sunday = addDays(monday, 6);
      const startAt = startOfDay(monday, tz);
      const endAt = endOfDay(sunday, tz);
      if (endAt.getTime() <= now.getTime()) {
        throw new LocalizedDateParseError('Ten tydzień już się skończył.');
      }
      return {
        scheduleKind: 'flexible_period',
        periodKey: 'this_week',
        startAt,
        endAt,
        scheduleHasExplicitTime: false,
        scheduleLabel: 'W tym tygodniu',
      };
    }
    case 'weekend': {
      if (fromRaw || toRaw) {
        throw new LocalizedDateParseError(
          'Dla „W weekend” zostaw pola OD/DO puste (albo wybierz dokładny termin).',
        );
      }
      const daysUntilSaturday = local.isoWeekday === 7 ? -1 : 6 - local.isoWeekday;
      const saturday = addDays(today, daysUntilSaturday);
      const sunday = addDays(saturday, 1);
      const startAt = startOfDay(saturday, tz);
      const endAt = endOfDay(sunday, tz);
      if (endAt.getTime() <= now.getTime()) {
        throw new LocalizedDateParseError('Ten weekend już się skończył.');
      }
      return {
        scheduleKind: 'flexible_period',
        periodKey: 'weekend',
        startAt,
        endAt,
        scheduleHasExplicitTime: false,
        scheduleLabel: 'W weekend',
      };
    }
    case 'flexible': {
      if (fromRaw || toRaw) {
        throw new LocalizedDateParseError('Dla „Do ustalenia” zostaw pola OD/DO puste.');
      }
      return {
        scheduleKind: 'flexible_period',
        periodKey: 'flexible',
        startAt: new Date(now.getTime()),
        endAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
        scheduleHasExplicitTime: false,
        scheduleLabel: 'Termin do ustalenia',
      };
    }
    default: {
      const _x: never = input.whenKind;
      throw new LocalizedDateParseError(`Nieobsługiwany wariant terminu: ${String(_x)}`);
    }
  }
}

export function whenKindFromDraftPayload(payload: Record<string, unknown>): WhenKind {
  const kind = typeof payload.scheduleKind === 'string' ? payload.scheduleKind : '';
  const period = typeof payload.periodKey === 'string' ? payload.periodKey : '';
  if (kind === 'exact') return 'exact';
  if (kind === 'range') return 'range';
  if (period === 'today') return 'today';
  if (period === 'tomorrow') return 'tomorrow';
  if (period === 'this_week') return 'this_week';
  if (period === 'weekend') return 'weekend';
  if (period === 'flexible') return 'flexible';
  return 'exact';
}

export function buildActivityFormModal(input: {
  opaqueDraftId: string;
  signingSecret: string;
  mode: 'create' | 'lfg' | 'edit';
  payload?: Record<string, unknown>;
}): ModalBuilder {
  const payload = input.payload ?? {};
  const title =
    input.mode === 'lfg'
      ? 'Szukam ekipy'
      : input.mode === 'edit'
        ? 'Edytuj aktywność'
        : 'Utwórz aktywność';
  const selected = whenKindFromDraftPayload(payload);
  const name = typeof payload.name === 'string' ? payload.name.slice(0, 100) : '';
  const description =
    typeof payload.description === 'string' ? payload.description.slice(0, 1000) : '';
  const fromPreset =
    typeof payload.scheduleFromDisplay === 'string' ? payload.scheduleFromDisplay.slice(0, 32) : '';
  const toPreset =
    typeof payload.scheduleToDisplay === 'string' ? payload.scheduleToDisplay.slice(0, 32) : '';

  const whenSelect = new StringSelectMenuBuilder()
    .setCustomId('when_kind')
    .setPlaceholder('Wybierz sposób określenia terminu')
    .addOptions(
      ...WHEN_OPTIONS.map((opt) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(opt.label)
          .setValue(opt.value)
          .setDescription(opt.description.slice(0, 100))
          .setDefault(opt.value === selected),
      ),
    );

  const nameInput = new TextInputBuilder()
    .setCustomId('name')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)
    .setPlaceholder('Np. Azrael');
  if (name.length > 0) nameInput.setValue(name);

  const fromInput = new TextInputBuilder()
    .setCustomId('schedule_from')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(32)
    .setPlaceholder('OD: 20.08.2026 18:00 lub 18:00');
  if (fromPreset.length > 0) fromInput.setValue(fromPreset);

  const toInput = new TextInputBuilder()
    .setCustomId('schedule_to')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(32)
    .setPlaceholder('DO: opcjonalnie');
  if (toPreset.length > 0) toInput.setValue(toPreset);

  const descriptionInput = new TextInputBuilder()
    .setCustomId('description')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000)
    .setPlaceholder('Krótki opis (opcjonalnie)');
  if (description.length > 0) descriptionInput.setValue(description);

  return new ModalBuilder()
    .setCustomId(createModalCustomId(input.mode, input.opaqueDraftId, input.signingSecret))
    .setTitle(title)
    .addLabelComponents(
      new LabelBuilder().setLabel('Nazwa').setTextInputComponent(nameInput),
      new LabelBuilder().setLabel('Kiedy?').setStringSelectMenuComponent(whenSelect),
      new LabelBuilder()
        .setLabel('OD (opcjonalnie)')
        .setDescription('Wymagane dla dokładnego terminu / przedziału')
        .setTextInputComponent(fromInput),
      new LabelBuilder()
        .setLabel('DO (opcjonalnie)')
        .setDescription('Wymagane dla przedziału OD–DO')
        .setTextInputComponent(toInput),
      new LabelBuilder().setLabel('Opis').setTextInputComponent(descriptionInput),
    );
}

export function parseActivityFormModal(interaction: ModalSubmitInteraction): {
  name: string;
  description: string;
  schedule: ResolvedActivitySchedule;
  scheduleFromDisplay: string;
  scheduleToDisplay: string;
} {
  const name = interaction.fields.getTextInputValue('name').trim();
  if (name.length === 0) {
    throw new LocalizedDateParseError('Podaj nazwę aktywności.');
  }
  const description = interaction.fields.getTextInputValue('description').trim();
  const fromRaw = interaction.fields.getTextInputValue('schedule_from');
  const toRaw = interaction.fields.getTextInputValue('schedule_to');
  const selected = interaction.fields.getStringSelectValues('when_kind')[0];
  if (
    selected !== 'exact' &&
    selected !== 'range' &&
    selected !== 'today' &&
    selected !== 'tomorrow' &&
    selected !== 'this_week' &&
    selected !== 'weekend' &&
    selected !== 'flexible'
  ) {
    throw new LocalizedDateParseError('Wybierz opcję w polu „Kiedy?”.');
  }
  const schedule = resolveWhenKindSchedule({
    whenKind: selected,
    fromRaw,
    toRaw,
  });
  return {
    name,
    description,
    schedule,
    scheduleFromDisplay: fromRaw.trim(),
    scheduleToDisplay: toRaw.trim(),
  };
}

export function scheduleToDraftPayload(
  parsed: ReturnType<typeof parseActivityFormModal>,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...extra,
    name: parsed.name,
    description: parsed.description,
    scheduleKind: parsed.schedule.scheduleKind,
    periodKey: parsed.schedule.periodKey,
    startAt: parsed.schedule.startAt.toISOString(),
    endAt: parsed.schedule.endAt?.toISOString() ?? null,
    scheduleHasExplicitTime: parsed.schedule.scheduleHasExplicitTime,
    scheduleLabel: parsed.schedule.scheduleLabel,
    scheduleFromDisplay: parsed.scheduleFromDisplay,
    scheduleToDisplay: parsed.scheduleToDisplay,
  };
}
