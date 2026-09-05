/** Maps node-pg / driver values to Date | null. Accepts Date, ISO string, or number. */
export function asNullableDate(value: unknown): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  // node-pg returns Date for timestamptz; also accept ISO strings.
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error('Expected valid Date from database');
    }
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('Expected parseable date from database');
    }
    return parsed;
  }
  throw new Error('Expected date-compatible database value');
}
