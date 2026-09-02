import { assertStartHorizon, ORDINARY_HORIZON_MS } from './create-limits.js';
import { ActivityError } from './errors.js';

export const SCHEDULE_KINDS = ['exact', 'range', 'flexible_period'] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

export const PERIOD_KEYS = ['today', 'tomorrow', 'this_week', 'weekend', 'flexible'] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

const POLISH_MONTHS_GENITIVE = [
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

const FLEXIBLE_HORIZON_MS = ORDINARY_HORIZON_MS;

export function isScheduleKind(value: string): value is ScheduleKind {
  return (SCHEDULE_KINDS as readonly string[]).includes(value);
}

export function isPeriodKey(value: string): value is PeriodKey {
  return (PERIOD_KEYS as readonly string[]).includes(value);
}

interface ZonedParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  /** 1 = Monday … 7 = Sunday (ISO). */
  readonly isoWeekday: number;
}

function readZonedParts(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }
  const weekday = map.weekday ?? 'Mon';
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
    second: Number(map.second ?? '0'),
    isoWeekday: weekdayMap[weekday] ?? 1,
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = readZonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

/** Convert a wall-clock local time in `timeZone` to a UTC `Date`. */
export function zonedLocalToUtc(
  input: {
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly hour?: number;
    readonly minute?: number;
    readonly second?: number;
    readonly millisecond?: number;
  },
  timeZone: string,
): Date {
  const hour = input.hour ?? 0;
  const minute = input.minute ?? 0;
  const second = input.second ?? 0;
  const millisecond = input.millisecond ?? 0;
  const utcGuess = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    hour,
    minute,
    second,
    millisecond,
  );
  const offset1 = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  let result = new Date(utcGuess - offset1);
  const offset2 = getTimeZoneOffsetMs(result, timeZone);
  if (offset2 !== offset1) {
    result = new Date(utcGuess - offset2);
  }
  return result;
}

function addCalendarDays(
  parts: { readonly year: number; readonly month: number; readonly day: number },
  days: number,
): { year: number; month: number; day: number } {
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

function startOfLocalDay(
  parts: { readonly year: number; readonly month: number; readonly day: number },
  timeZone: string,
): Date {
  return zonedLocalToUtc({ ...parts, hour: 0, minute: 0, second: 0, millisecond: 0 }, timeZone);
}

function endOfLocalDay(
  parts: { readonly year: number; readonly month: number; readonly day: number },
  timeZone: string,
): Date {
  const nextDay = addCalendarDays(parts, 1);
  return new Date(startOfLocalDay(nextDay, timeZone).getTime() - 1);
}

function parseHm(value: string): { hour: number; minute: number } {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (match === null) {
    throw new ActivityError('VALIDATION_FAILED', `Invalid HH:mm time: ${value}`);
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function applyOptionalDayTimes(input: {
  readonly day: { readonly year: number; readonly month: number; readonly day: number };
  readonly timeZone: string;
  readonly fromTime?: string;
  readonly toTime?: string;
}): { startAt: Date; endAt: Date } {
  const dayStart = startOfLocalDay(input.day, input.timeZone);
  const dayEnd = endOfLocalDay(input.day, input.timeZone);
  let startAt = dayStart;
  let endAt = dayEnd;
  if (input.fromTime !== undefined) {
    const from = parseHm(input.fromTime);
    startAt = zonedLocalToUtc({ ...input.day, ...from, second: 0, millisecond: 0 }, input.timeZone);
  }
  if (input.toTime !== undefined) {
    const to = parseHm(input.toTime);
    endAt = zonedLocalToUtc({ ...input.day, ...to, second: 0, millisecond: 0 }, input.timeZone);
  }
  if (endAt.getTime() < startAt.getTime()) {
    throw new ActivityError('VALIDATION_FAILED', 'toTime must be >= fromTime within the day');
  }
  return { startAt, endAt };
}

/**
 * Resolve flexible-period wall-clock bounds in an IANA timezone (e.g. Europe/Warsaw).
 * Week starts Monday. Weekend = Saturday 00:00 – Sunday end-of-day in that timezone.
 */
export function resolveFlexiblePeriodBounds(input: {
  readonly periodKey: PeriodKey;
  readonly now: Date;
  readonly timeZone: string;
  readonly fromTime?: string;
  readonly toTime?: string;
}): { startAt: Date; endAt: Date } {
  const local = readZonedParts(input.now, input.timeZone);
  const today = { year: local.year, month: local.month, day: local.day };

  switch (input.periodKey) {
    case 'today':
      return applyOptionalDayTimes({
        day: today,
        timeZone: input.timeZone,
        ...(input.fromTime !== undefined ? { fromTime: input.fromTime } : {}),
        ...(input.toTime !== undefined ? { toTime: input.toTime } : {}),
      });
    case 'tomorrow': {
      const tomorrow = addCalendarDays(today, 1);
      return applyOptionalDayTimes({
        day: tomorrow,
        timeZone: input.timeZone,
        ...(input.fromTime !== undefined ? { fromTime: input.fromTime } : {}),
        ...(input.toTime !== undefined ? { toTime: input.toTime } : {}),
      });
    }
    case 'this_week': {
      const daysFromMonday = local.isoWeekday - 1;
      const monday = addCalendarDays(today, -daysFromMonday);
      const sunday = addCalendarDays(monday, 6);
      return {
        startAt: startOfLocalDay(monday, input.timeZone),
        endAt: endOfLocalDay(sunday, input.timeZone),
      };
    }
    case 'weekend': {
      // Current weekend if Sat/Sun; otherwise upcoming Sat–Sun.
      const daysUntilSaturday = local.isoWeekday === 7 ? -1 : 6 - local.isoWeekday;
      const saturday = addCalendarDays(today, daysUntilSaturday);
      const sunday = addCalendarDays(saturday, 1);
      return {
        startAt: startOfLocalDay(saturday, input.timeZone),
        endAt: endOfLocalDay(sunday, input.timeZone),
      };
    }
    case 'flexible':
      return {
        startAt: new Date(input.now.getTime()),
        endAt: new Date(input.now.getTime() + FLEXIBLE_HORIZON_MS),
      };
    default: {
      const _exhaustive: never = input.periodKey;
      throw new ActivityError('VALIDATION_FAILED', `Unknown periodKey: ${String(_exhaustive)}`);
    }
  }
}

export function assertScheduleValid(input: {
  readonly kind: ScheduleKind;
  readonly periodKey?: PeriodKey | null;
  readonly startAt: Date;
  readonly endAt?: Date | null;
  readonly now: Date;
  readonly allowExtendedHorizon: boolean;
}): void {
  const endAt = input.endAt ?? null;

  if (input.kind === 'exact') {
    if (Number.isNaN(input.startAt.getTime())) {
      throw new ActivityError('VALIDATION_FAILED', 'startAt is required for exact schedule');
    }
    if (endAt !== null && endAt.getTime() < input.startAt.getTime()) {
      throw new ActivityError('VALIDATION_FAILED', 'endAt must be >= startAt');
    }
    assertStartHorizon({
      startAt: input.startAt,
      now: input.now,
      allowExtendedHorizon: input.allowExtendedHorizon,
    });
    return;
  }

  if (input.kind === 'range') {
    if (endAt === null) {
      throw new ActivityError('VALIDATION_FAILED', 'endAt is required for range schedule');
    }
    if (endAt.getTime() < input.startAt.getTime()) {
      throw new ActivityError('VALIDATION_FAILED', 'range requires startAt <= endAt');
    }
    assertStartHorizon({
      startAt: input.startAt,
      now: input.now,
      allowExtendedHorizon: input.allowExtendedHorizon,
    });
    if (!input.allowExtendedHorizon) {
      const max = input.now.getTime() + ORDINARY_HORIZON_MS;
      if (endAt.getTime() > max) {
        throw new ActivityError(
          'HORIZON_EXCEEDED',
          'Ordinary members may only schedule activities within 14 days',
        );
      }
    }
    return;
  }

  // flexible_period
  if (input.periodKey === undefined || input.periodKey === null) {
    throw new ActivityError('VALIDATION_FAILED', 'periodKey is required for flexible_period');
  }
  if (endAt === null) {
    throw new ActivityError(
      'VALIDATION_FAILED',
      'endAt (period end) is required for flexible_period',
    );
  }
  if (endAt.getTime() < input.startAt.getTime()) {
    throw new ActivityError('VALIDATION_FAILED', 'period end must be >= period start');
  }
  // Allow ongoing periods (e.g. this_week) whose start is already past, as long as
  // the period is not entirely in the past.
  if (endAt.getTime() <= input.now.getTime()) {
    throw new ActivityError('VALIDATION_FAILED', 'Schedule period is entirely in the past');
  }
  if (!input.allowExtendedHorizon) {
    const max = input.now.getTime() + ORDINARY_HORIZON_MS;
    if (input.startAt.getTime() > max || endAt.getTime() > max) {
      throw new ActivityError(
        'HORIZON_EXCEEDED',
        'Ordinary members may only schedule activities within 14 days',
      );
    }
  }
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function formatPolishDateTime(
  parts: ZonedParts,
  options: { readonly includeYear: boolean },
): string {
  const month = POLISH_MONTHS_GENITIVE[parts.month - 1] ?? String(parts.month);
  const datePart = options.includeYear
    ? `${parts.day} ${month} ${parts.year}`
    : `${parts.day} ${month}`;
  return `${datePart}, ${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

/**
 * Polish UX schedule labels for Discord / inbox / projections.
 */
export function formatScheduleLabel(input: {
  readonly kind: ScheduleKind;
  readonly periodKey?: PeriodKey | null;
  readonly startAt: Date;
  readonly endAt?: Date | null;
  readonly timeZone: string;
  readonly hasExplicitTime?: boolean;
}): string {
  const hasExplicitTime = input.hasExplicitTime ?? true;
  const startParts = readZonedParts(input.startAt, input.timeZone);
  const endAt = input.endAt ?? null;

  if (input.kind === 'flexible_period') {
    switch (input.periodKey) {
      case 'today':
        if (hasExplicitTime && endAt !== null) {
          const endParts = readZonedParts(endAt, input.timeZone);
          if (
            startParts.hour !== 0 ||
            startParts.minute !== 0 ||
            endParts.hour !== 23 ||
            endParts.minute !== 59
          ) {
            return `Dziś, ${pad2(startParts.hour)}:${pad2(startParts.minute)}–${pad2(endParts.hour)}:${pad2(endParts.minute)}`;
          }
        }
        return 'Dziś';
      case 'tomorrow':
        if (hasExplicitTime && endAt !== null) {
          const endParts = readZonedParts(endAt, input.timeZone);
          if (
            startParts.hour !== 0 ||
            startParts.minute !== 0 ||
            endParts.hour !== 23 ||
            endParts.minute !== 59
          ) {
            return `Jutro, ${pad2(startParts.hour)}:${pad2(startParts.minute)}–${pad2(endParts.hour)}:${pad2(endParts.minute)}`;
          }
        }
        return 'Jutro';
      case 'this_week':
        return 'W tym tygodniu';
      case 'weekend':
        return 'W weekend';
      case 'flexible':
        return 'Termin do ustalenia';
      default:
        return 'Termin do ustalenia';
    }
  }

  if (input.kind === 'range' && endAt !== null) {
    const endParts = readZonedParts(endAt, input.timeZone);
    const sameDay =
      startParts.year === endParts.year &&
      startParts.month === endParts.month &&
      startParts.day === endParts.day;
    if (sameDay) {
      return `${startParts.day} ${POLISH_MONTHS_GENITIVE[startParts.month - 1]}, ${pad2(startParts.hour)}:${pad2(startParts.minute)}–${pad2(endParts.hour)}:${pad2(endParts.minute)}`;
    }
    return `${formatPolishDateTime(startParts, { includeYear: false })} – ${formatPolishDateTime(endParts, { includeYear: false })}`;
  }

  // exact
  if (!hasExplicitTime) {
    const month = POLISH_MONTHS_GENITIVE[startParts.month - 1] ?? String(startParts.month);
    return `${startParts.day} ${month} ${startParts.year}`;
  }
  return formatPolishDateTime(startParts, { includeYear: true });
}

/** Fields to attach beside startAtIso on projection / outbox / inbox payloads. */
export function buildSchedulePayloadFields(input: {
  readonly scheduleKind: ScheduleKind;
  readonly periodKey: PeriodKey | null;
  readonly startAt: Date;
  readonly endAt: Date | null;
  readonly timeZone: string;
  readonly scheduleHasExplicitTime: boolean;
}): {
  readonly startAtIso: string;
  readonly scheduleKind: ScheduleKind;
  readonly periodKey: PeriodKey | null;
  readonly scheduleLabel: string;
  readonly scheduleHasExplicitTime: boolean;
} {
  return {
    startAtIso: input.startAt.toISOString(),
    scheduleKind: input.scheduleKind,
    periodKey: input.periodKey,
    scheduleLabel: formatScheduleLabel({
      kind: input.scheduleKind,
      periodKey: input.periodKey,
      startAt: input.startAt,
      endAt: input.endAt,
      timeZone: input.timeZone,
      hasExplicitTime: input.scheduleHasExplicitTime,
    }),
    scheduleHasExplicitTime: input.scheduleHasExplicitTime,
  };
}
