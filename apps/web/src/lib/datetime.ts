const DEFAULT_TZ = 'Europe/Warsaw';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function getZonedParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type)?.value;
    return Number.parseInt(found ?? '0', 10);
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

/** Formats an instant as `DD.MM.YYYY HH:mm` in the given IANA zone (default Europe/Warsaw). */
export function formatPolishDateTime(
  value: Date | string | number,
  timeZone: string = DEFAULT_TZ,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  const parts = getZonedParts(date, timeZone);
  return `${pad2(parts.day)}.${pad2(parts.month)}.${parts.year} ${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

function startOfDayMinutes(parts: { year: number; month: number; day: number }): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day) / 60_000;
}

/** Compact Polish when-line: Dziś/Jutro when possible. */
export function formatActivityWhen(
  value: Date | string | number,
  timeZone: string = DEFAULT_TZ,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  const parts = getZonedParts(date, timeZone);
  const now = getZonedParts(new Date(), timeZone);
  const time = `${pad2(parts.hour)}:${pad2(parts.minute)}`;
  const deltaDays = Math.round(startOfDayMinutes(parts) - startOfDayMinutes(now)) / (24 * 60);
  if (deltaDays === 0) {
    return `Dziś, ${time}`;
  }
  if (deltaDays === 1) {
    return `Jutro, ${time}`;
  }
  return formatPolishDateTime(date, timeZone);
}
