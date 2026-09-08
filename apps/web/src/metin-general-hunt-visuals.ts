import type {
  MetinGeneralHuntPoint,
  MetinGeneralHuntRoute,
} from './metin-general-hunts-api';

const HUNT_INTERVAL_HOURS: Readonly<Record<string, 4 | 6>> = {
  'metin-red-las': 6,
  'metin-v1': 6,
  'general-v1': 4,
  'metin-v2': 6,
  'general-v2': 4,
};

const WARSAW_CLOCK = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Warsaw',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const ROUTE_PALETTE = [
  '#4cc9f0',
  '#ff5d8f',
  '#8ac926',
  '#ffca3a',
  '#9b5de5',
  '#ff7a00',
  '#00f5d4',
  '#f15bb5',
  '#3a86ff',
  '#fb5607',
  '#b8f2e6',
  '#e0aaff',
  '#06d6a0',
  '#ffd166',
  '#ef476f',
  '#90e0ef',
] as const;

type WarsawClockParts = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
};

function warsawClockParts(now: number): WarsawClockParts {
  const values = new Map(
    WARSAW_CLOCK.formatToParts(new Date(now)).map((part) => [part.type, part.value] as const),
  );
  const result = {
    year: Number(values.get('year')),
    month: Number(values.get('month')),
    day: Number(values.get('day')),
    hour: Number(values.get('hour')),
    minute: Number(values.get('minute')),
    second: Number(values.get('second')),
  };
  if (Object.values(result).some((value) => !Number.isInteger(value))) {
    throw new Error('could not resolve Europe/Warsaw hunt clock');
  }
  return result;
}

function calendarPartsAsUtc(parts: WarsawClockParts): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

/** Convert an unambiguous Europe/Warsaw wall-clock time to an epoch timestamp. */
function warsawWallClockToEpoch(parts: WarsawClockParts): number {
  const targetCalendar = calendarPartsAsUtc(parts);
  let guess = targetCalendar;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const resolvedCalendar = calendarPartsAsUtc(warsawClockParts(guess));
    const delta = targetCalendar - resolvedCalendar;
    if (Math.abs(delta) < 1_000) return guess;
    guess += delta;
  }

  return guess;
}

export function nextMetinGeneralHuntSpawn(intervalHours: 4 | 6, now = Date.now()): number {
  const current = warsawClockParts(now);
  const nextHour = (Math.floor(current.hour / intervalHours) + 1) * intervalHours;
  const calendarTarget = new Date(
    Date.UTC(current.year, current.month - 1, current.day, nextHour, 0, 0),
  );

  return warsawWallClockToEpoch({
    year: calendarTarget.getUTCFullYear(),
    month: calendarTarget.getUTCMonth() + 1,
    day: calendarTarget.getUTCDate(),
    hour: calendarTarget.getUTCHours(),
    minute: 0,
    second: 0,
  });
}

export function formatWarsawHuntClock(value: number): string {
  return new Date(value).toLocaleTimeString('pl-PL', {
    timeZone: 'Europe/Warsaw',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function userHash(userId: string): number {
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function pickUnusedColor(userId: string, used: ReadonlySet<string>): string {
  const start = userHash(userId) % ROUTE_PALETTE.length;
  for (let offset = 0; offset < ROUTE_PALETTE.length; offset += 1) {
    const color = ROUTE_PALETTE[(start + offset) % ROUTE_PALETTE.length]!;
    if (!used.has(color)) return color;
  }

  let attempt = 0;
  while (attempt < 360) {
    const hue = (userHash(userId) + attempt * 137) % 360;
    const color = `hsl(${hue} 88% 64%)`;
    if (!used.has(color)) return color;
    attempt += 1;
  }
  return '#ffffff';
}

export function routeColorAssignments(
  routes: readonly MetinGeneralHuntRoute[],
): ReadonlyMap<string, string> {
  const assignments = new Map<string, string>();
  const used = new Set<string>();

  for (const route of routes) {
    if (!route.color || assignments.has(route.userId)) continue;
    assignments.set(route.userId, route.color);
    used.add(route.color);
  }

  for (const route of routes) {
    if (assignments.has(route.userId)) continue;
    const color = pickUnusedColor(route.userId, used);
    assignments.set(route.userId, color);
    used.add(color);
  }

  return assignments;
}

export function pickRouteColor(
  userId: string,
  routes: readonly MetinGeneralHuntRoute[],
): string {
  const assignments = routeColorAssignments(routes);
  const existing = assignments.get(userId);
  if (existing) return existing;
  return pickUnusedColor(userId, new Set(assignments.values()));
}

export function routeDisplayColor(
  route: MetinGeneralHuntRoute,
  visibleRoutes: readonly MetinGeneralHuntRoute[],
): string {
  return route.color ?? routeColorAssignments(visibleRoutes).get(route.userId) ?? '#ffffff';
}

function clampCoordinate(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function rounded(value: number): string {
  return clampCoordinate(value).toFixed(2).replace(/\.00$/, '');
}

export function smoothRoutePath(points: readonly MetinGeneralHuntPoint[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${rounded(points[0]!.x)} ${rounded(points[0]!.y)}`;
  if (points.length === 2) {
    return `M ${rounded(points[0]!.x)} ${rounded(points[0]!.y)} L ${rounded(points[1]!.x)} ${rounded(points[1]!.y)}`;
  }

  const commands = [`M ${rounded(points[0]!.x)} ${rounded(points[0]!.y)}`];
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index]!;
    const current = points[index]!;
    const next = points[index + 1]!;
    const afterNext = points[index + 2] ?? next;
    const control1 = {
      x: current.x + (next.x - previous.x) / 6,
      y: current.y + (next.y - previous.y) / 6,
    };
    const control2 = {
      x: next.x - (afterNext.x - current.x) / 6,
      y: next.y - (afterNext.y - current.y) / 6,
    };
    commands.push(
      `C ${rounded(control1.x)} ${rounded(control1.y)} ${rounded(control2.x)} ${rounded(control2.y)} ${rounded(next.x)} ${rounded(next.y)}`,
    );
  }
  return commands.join(' ');
}

export function metinGeneralHuntEventCycleKey(huntKey: string, now = Date.now()): string {
  const intervalHours = HUNT_INTERVAL_HOURS[huntKey];
  if (!intervalHours) throw new Error(`unknown metin/general hunt key: ${huntKey}`);
  const values = warsawClockParts(now);
  const slotHour = Math.floor(values.hour / intervalHours) * intervalHours;
  return `${values.year}-${String(values.month).padStart(2, '0')}-${String(values.day).padStart(2, '0')}T${String(slotHour).padStart(2, '0')}:00@Europe/Warsaw/${intervalHours}h`;
}
