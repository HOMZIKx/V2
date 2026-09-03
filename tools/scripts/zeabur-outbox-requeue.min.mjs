import { createRequire } from 'node:module';
const require = createRequire('/app/services/activity-service/package.json');
const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.ACTIVITY_DATABASE_URL });
const failed = await pool.query("select id from outbox_messages where status='failed'");
const ids = failed.rows.map((r) => r.id);
if (ids.length === 0) {
  console.log('requeued 0');
} else {
  const updated = await pool.query(
    "update outbox_messages set status='pending', claim_owner=null, claim_expires_at=null, available_at=now(), last_error=null, attempt_count=0 where id = any($1::uuid[]) and status='failed'",
    [ids],
  );
  console.log('requeued', updated.rowCount);
}
await pool.end();
