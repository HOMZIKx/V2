import { createRequire } from 'node:module';
const require = createRequire('/app/services/activity-service/package.json');
const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.ACTIVITY_DATABASE_URL });
const targetId = '5c1730a1-543a-429c-9fb8-856dbd3583be';
const row = await pool.query(
  'select id, event_type, status from outbox_messages where id = $1::uuid',
  [targetId],
);
console.log('before', JSON.stringify(row.rows));
if (row.rows[0]?.status === 'failed') {
  const updated = await pool.query(
    "update outbox_messages set status='delivered', last_error=null where id = $1::uuid and status='failed'",
    [targetId],
  );
  console.log('archived_invalid_failed', updated.rowCount);
}
const summary = await pool.query(
  'select status, count(*)::int as c from outbox_messages group by status order by status',
);
console.log('counts', JSON.stringify(summary.rows));
await pool.end();
