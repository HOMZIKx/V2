import { createRequire } from 'node:module';

const require = createRequire('/app/services/identity-service/package.json');
const pg = require('pg');

const discordId = process.env.PROBE_DISCORD_ID ?? '808066932753563668';
const url = process.env.IDENTITY_DATABASE_URL;
if (!url) {
  console.error('IDENTITY_DATABASE_URL missing');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
try {
  const accounts = await pool.query(
    `SELECT "userId", "accountId", "providerId"
     FROM account
     WHERE "providerId" = 'discord' AND "accountId" = $1`,
    [discordId],
  );
  const users = await pool.query(
    `SELECT u.id, u.name, u.email
     FROM "user" u
     JOIN account a ON a."userId" = u.id
     WHERE a."providerId" = 'discord' AND a."accountId" = $1`,
    [discordId],
  );
  console.log(
    JSON.stringify({
      discordId,
      accounts: accounts.rows.map((r) => ({ userId: r.userId, accountId: r.accountId })),
      users: users.rows.map((r) => ({ id: r.id, name: r.name })),
    }),
  );
} finally {
  await pool.end();
}
