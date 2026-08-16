/**
 * Polish local datetime for Discord player UX (Europe/Warsaw).
 * Backend still stores canonical UTC ISO timestamps.
 */

export class LocalizedDateParseError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'LocalizedDateParseError';
  }
}

const DEFAULT_TZ = 'Europe/Warsaw';

const INPUT_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[,\s]+|[ T]+)(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function getZonedParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((p) => p.type === type)?.value;
    if (value === undefined) {
      throw new LocalizedDateParseError('Nie udało się odczytać strefy czasowej.');
    }
    return Number(value);
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

function isValidCivilDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/** Convert civil wall time in `timeZone` to a UTC Date. */
export function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string = DEFAULT_TZ,
): Date {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i += 1) {
    const parts = getZonedParts(new Date(utcMs), timeZone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    const target = Date.UTC(year, month - 1, day, hour, minute, 0);
    const delta = target - asUtc;
    if (delta === 0) break;
    utcMs += delta;
  }
  const verify = getZonedParts(new Date(utcMs), timeZone);
  if (
    verify.year !== year ||
    verify.month !== month ||
    verify.day !== day ||
    verify.hour !== hour ||
    verify.minute !== minute
  ) {
    throw new LocalizedDateParseError(
      'Ta data i godzina nie istnieją w lokalnej strefie czasowej (np. zmiana czasu).',
    );
  }
  return new Date(utcMs);
}

/**
 * Parse player input like `20.08.2026 18:00` (Europe/Warsaw) → UTC Date.
 */
export function parsePolishLocalDateTime(
  raw: string,
  options?: { now?: Date; timeZone?: string; maxHorizonDays?: number },
): Date {
  const timeZone = options?.timeZone ?? DEFAULT_TZ;
  const now = options?.now ?? new Date();
  const maxHorizonDays = options?.maxHorizonDays ?? 14;
  const trimmed = raw.trim();
  const match = INPUT_RE.exec(trimmed);
  if (match === null) {
    throw new LocalizedDateParseError(
      'Podaj datę i godzinę w formacie DD.MM.RRRR GG:MM (np. 20.08.2026 18:00).',
    );
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (!isValidCivilDate(year, month, day)) {
    throw new LocalizedDateParseError('Nieprawidłowa data kalendarzowa.');
  }
  if (hour > 23 || minute > 59) {
    throw new LocalizedDateParseError('Nieprawidłowa godzina.');
  }
  const date = zonedLocalToUtc(year, month, day, hour, minute, timeZone);
  if (date.getTime() < now.getTime() - 60_000) {
    throw new LocalizedDateParseError('Termin musi być w przyszłości.');
  }
  const horizonMs = maxHorizonDays * 24 * 60 * 60 * 1000;
  if (date.getTime() > now.getTime() + horizonMs) {
    throw new LocalizedDateParseError(
      `Termin może być najwyżej ${String(maxHorizonDays)} dni do przodu.`,
    );
  }
  return date;
}

export function formatPolishLocalDateTime(date: Date, timeZone: string = DEFAULT_TZ): string {
  const parts = getZonedParts(date, timeZone);
  return `${pad2(parts.day)}.${pad2(parts.month)}.${parts.year} ${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

export function tryParseIsoOrPolishLocal(
  raw: string,
  options?: { now?: Date; timeZone?: string; maxHorizonDays?: number },
): Date {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const iso = new Date(trimmed);
    if (Number.isNaN(iso.getTime())) {
      throw new LocalizedDateParseError('Nieprawidłowa data i godzina.');
    }
    return iso;
  }
  return parsePolishLocalDateTime(trimmed, options);
}
