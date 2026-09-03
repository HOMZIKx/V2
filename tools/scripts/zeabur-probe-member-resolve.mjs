import { createRequire } from 'node:module';
const require = createRequire('/app/services/activity-service/package.json');
const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.ACTIVITY_DATABASE_URL });
const guild = '1534228693017432124';
const owner = '808066932753563668';
const acts = await pool.query(
  `SELECT id, name, organizer_discord_user_id, status FROM activities WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 5`,
  [guild],
);
const secret = process.env.ACTIVITY_PROJECTION_SHARED_SECRET ?? '';
const base =
  process.env.ACTIVITY_DISCORD_GATEWAY_BASE_URL ??
  process.env.ACTIVITY_DISCORD_PROJECTION_BASE_URL ??
  '';
let resolve = null;
if (base) {
  try {
    const res = await fetch(
      `${base.replace(/\/$/, '')}/internal/activity/v1/guilds/${guild}/members/resolve`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-activity-projection-secret': secret,
        },
        body: JSON.stringify({ userIds: [owner] }),
      },
    );
    resolve = { status: res.status, body: await res.text() };
  } catch (error) {
    resolve = { error: error instanceof Error ? error.message : String(error) };
  }
}
console.log(JSON.stringify({ activities: acts.rows, resolve }, null, 2));
await pool.end();
