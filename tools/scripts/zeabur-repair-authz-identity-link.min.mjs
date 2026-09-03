import { createRequire } from 'node:module';

const require = createRequire('/app/services/authorization-service/package.json');
const pg = require('pg');

const discordId = process.env.REPAIR_DISCORD_ID ?? '808066932753563668';
const v2UserId =
  process.env.REPAIR_V2_USER_ID?.trim() ??
  process.argv[2]?.trim() ??
  '828ad2f2-6f54-48c9-8fe5-1b5c2d18f9fa';
const url = process.env.AUTHORIZATION_DATABASE_URL ?? process.env.DATABASE_URL;

if (!url) {
  console.error('AUTHORIZATION_DATABASE_URL missing');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
try {
  const before = await pool.query(
    `SELECT discord_user_id, v2_user_id FROM discord_identity_link WHERE discord_user_id = $1`,
    [discordId],
  );
  console.log('before', JSON.stringify(before.rows));

  if (before.rows.length === 0) {
    await pool.query(
      `INSERT INTO discord_identity_link (discord_user_id, v2_user_id) VALUES ($1, $2)`,
      [discordId, v2UserId],
    );
    console.log('inserted new link');
  } else if (before.rows[0].v2_user_id !== v2UserId) {
    await pool.query(
      `UPDATE discord_identity_link SET v2_user_id = $1, linked_at = now() WHERE discord_user_id = $2`,
      [v2UserId, discordId],
    );
    await pool.query(
      `UPDATE discord_membership SET v2_user_id = $1, updated_at = now() WHERE discord_user_id = $2`,
      [v2UserId, discordId],
    );
    console.log('repaired link to canonical identity v2 user');
  } else {
    console.log('link already matches');
  }

  const after = await pool.query(
    `SELECT discord_user_id, v2_user_id FROM discord_identity_link WHERE discord_user_id = $1`,
    [discordId],
  );
  console.log('after', JSON.stringify(after.rows));
} finally {
  await pool.end();
}
