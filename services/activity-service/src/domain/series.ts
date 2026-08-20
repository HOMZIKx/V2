export type RecurrenceKind = 'daily' | 'weekly' | 'weekdays';

export type SeriesEditScope = 'this' | 'this_and_following';
export type SeriesCancelScope = 'this' | 'this_and_following' | 'entire_series';
export type SeriesRsvpScope = 'occurrence' | 'series';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const SERIES_MAX_HORIZON_DAYS = 90;

export function assertSeriesHorizon(
  startAt: Date,
  horizonEndAt: Date,
  now: Date = new Date(),
): void {
  if (horizonEndAt.getTime() <= startAt.getTime()) {
    throw Object.assign(new Error('Series horizon must end after the first occurrence'), {
      code: 'VALIDATION_FAILED',
    });
  }
  const maxEnd = new Date(now.getTime() + SERIES_MAX_HORIZON_DAYS * MS_PER_DAY);
  if (horizonEndAt.getTime() > maxEnd.getTime()) {
    throw Object.assign(new Error('Series horizon exceeds 90 days from now'), {
      code: 'HORIZON_EXCEEDED',
    });
  }
}

/** Expand occurrence start times (UTC instants) up to horizonEndAt inclusive of same calendar day. */
export function expandSeriesOccurrenceStarts(input: {
  readonly kind: RecurrenceKind;
  readonly firstStartAt: Date;
  readonly horizonEndAt: Date;
  readonly weekdays?: readonly number[];
}): Date[] {
  const starts: Date[] = [];
  const first = input.firstStartAt.getTime();
  const end = input.horizonEndAt.getTime();
  if (end < first) {
    return starts;
  }

  if (input.kind === 'daily') {
    for (let t = first; t <= end; t += MS_PER_DAY) {
      starts.push(new Date(t));
    }
    return starts;
  }

  if (input.kind === 'weekly') {
    for (let t = first; t <= end; t += 7 * MS_PER_DAY) {
      starts.push(new Date(t));
    }
    return starts;
  }

  const allowed = new Set(input.weekdays ?? []);
  if (allowed.size === 0) {
    return starts;
  }
  const cursor = new Date(input.firstStartAt);
  while (cursor.getTime() <= end) {
    // getUTCDay: 0=Sun..6=Sat → ISO 1=Mon..7=Sun
    const iso = ((cursor.getUTCDay() + 6) % 7) + 1;
    if (allowed.has(iso) && cursor.getTime() >= first) {
      starts.push(new Date(cursor.getTime()));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return starts;
}
