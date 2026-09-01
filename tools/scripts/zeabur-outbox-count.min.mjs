import { createRequire } from 'node:module';
const require = createRequire('/app/services/activity-service/package.json');
const pg = require('pg');
const requeue = process.argv.includes('--requeue');
const pool = new pg.Pool({ connectionString: process.env.ACTIVITY_DATABASE_URL });
const summary = await pool.query(
  'select status, count(*)::int as c from outbox_messages group by status order by status',
);
console.log('counts', JSON.stringify(summary.rows));
const failed = await pool.query(
  "select id, event_type, attempt_count, left(coalesce(last_error,''),120) as err, aggregate_type, aggregate_id from outbox_messages where status='failed' order by occurred_at asc limit 10",
);
console.log('failed', JSON.stringify(failed.rows));
if (requeue && failed.rows.length > 0) {
  const ids = failed.rows.map((r) => r.id);
  const updated = await pool.query(
    "update outbox_messages set status='pending', claim_owner=null, claim_expires_at=null, available_at=now(), last_error=null where id = any($1::uuid[]) and status='failed'",
    [ids],
  );
  console.log('requeued', updated.rowCount);
}
await pool.end();
