/**
 * Inspect failed outbox rows (no payload bodies) and optionally requeue for retry.
 * Usage: tsx scripts/zeabur-outbox-inspect-repair.mts [--requeue]
 */
import pg from 'pg';

const requeue = process.argv.includes('--requeue');
const databaseUrl = process.env.ACTIVITY_DATABASE_URL?.trim();
if (databaseUrl === undefined || databaseUrl.length === 0) {
  console.error('ACTIVITY_DATABASE_URL required');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  const summary = await pool.query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count FROM outbox_messages GROUP BY status ORDER BY status`,
  );
  console.log('outbox counts:', summary.rows);

  const failed = await pool.query<{
    id: string;
    event_type: string;
    attempt_count: number;
    last_error: string | null;
    aggregate_type: string;
    aggregate_id: string;
  }>(
    `SELECT id, event_type, attempt_count, left(coalesce(last_error,''), 120) AS last_error, aggregate_type, aggregate_id
     FROM outbox_messages WHERE status = 'failed' ORDER BY created_at ASC LIMIT 20`,
  );
  for (const row of failed.rows) {
    console.log(
      `failed id=${row.id} type=${row.event_type} attempts=${row.attempt_count} agg=${row.aggregate_type}:${row.aggregate_id} err=${row.last_error ?? ''}`,
    );
  }

  if (requeue && failed.rows.length > 0) {
    const ids = failed.rows.map((r) => r.id);
    const result = await pool.query(
      `UPDATE outbox_messages
       SET status = 'pending', claim_owner = NULL, claim_expires_at = NULL, next_attempt_at = NOW(), last_error = NULL
       WHERE id = ANY($1::uuid[]) AND status = 'failed'`,
      [ids],
    );
    console.log(`requeued ${result.rowCount} failed row(s)`);
  }
} finally {
  await pool.end();
}
