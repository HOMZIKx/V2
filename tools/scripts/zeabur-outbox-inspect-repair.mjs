#!/usr/bin/env node
/**
 * Inspect/requeue failed outbox rows via activity-service container (uses ACTIVITY_DATABASE_URL in env).
 * Usage: node tools/scripts/zeabur-outbox-inspect-repair.mjs [--requeue]
 */
import { spawnSync } from 'node:child_process';

const requeue = process.argv.includes('--requeue');
const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const activityServiceID = '6a8211c2a21454a2cf6ad77b';

const remote = `node --input-type=module -e "import pg from 'pg'; const pool=new pg.Pool({connectionString:process.env.ACTIVITY_DATABASE_URL}); const summary=await pool.query('SELECT status, COUNT(*)::text AS count FROM outbox_messages GROUP BY status ORDER BY status'); console.log('counts', summary.rows); const failed=await pool.query(\\\"SELECT id, event_type, attempt_count, left(coalesce(last_error,''),120) AS last_error, aggregate_type, aggregate_id FROM outbox_messages WHERE status = 'failed' ORDER BY created_at ASC LIMIT 20\\\"); for (const row of failed.rows) { console.log('failed', row.id, row.event_type, row.attempt_count, row.aggregate_type, row.aggregate_id, row.last_error??''); } ${requeue ? "if (failed.rows.length>0) { const ids=failed.rows.map(r=>r.id); const u=await pool.query(\\\"UPDATE outbox_messages SET status='pending', claim_owner=NULL, claim_expires_at=NULL, next_attempt_at=NOW(), last_error=NULL WHERE id = ANY($1::uuid[]) AND status='failed'\\\", [ids]); console.log('requeued', u.rowCount); }" : ''} await pool.end();"`;

const result = spawnSync(
  'npx',
  [
    'zeabur@latest',
    '-i=false',
    'service',
    'exec',
    '--id',
    activityServiceID,
    '--env-id',
    environmentID,
    '--',
    'sh',
    '-c',
    remote,
  ],
  { encoding: 'utf8', shell: true, timeout: 120_000 },
);

process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
process.exit(result.status ?? 1);
