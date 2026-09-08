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
  hourCycle: 'h23',
});

function warsawParts(now: Date): {
  readonly year: string;
  readonly month: string;
  readonly day: string;
  readonly hour: number;
} {
  const values = new Map(
    WARSAW_CLOCK.formatToParts(now).map((part) => [part.type, part.value] as const),
  );
  const year = values.get('year');
  const month = values.get('month');
  const day = values.get('day');
  const hour = Number(values.get('hour'));
  if (!year || !month || !day || !Number.isInteger(hour)) {
    throw new Error('could not resolve Europe/Warsaw hunt cycle clock');
  }
  return { year, month, day, hour };
}

export function metinGeneralHuntEventCycleKey(huntKey: string, now = new Date()): string {
  const intervalHours = HUNT_INTERVAL_HOURS[huntKey];
  if (!intervalHours) throw new Error(`unknown metin/general hunt key: ${huntKey}`);
  const local = warsawParts(now);
  const slotHour = Math.floor(local.hour / intervalHours) * intervalHours;
  return `${local.year}-${local.month}-${local.day}T${String(slotHour).padStart(2, '0')}:00@Europe/Warsaw/${intervalHours}h`;
}

export function emptyMetinGeneralHuntEventState(
  huntKey: string,
  now = new Date(),
): Record<string, unknown> {
  return {
    huntKey,
    eventCycleKey: metinGeneralHuntEventCycleKey(huntKey, now),
    routes: [],
    markers: [],
    requests: [],
    history: [],
  };
}
