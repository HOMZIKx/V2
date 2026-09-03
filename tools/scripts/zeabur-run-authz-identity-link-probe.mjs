#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const authzServiceID = '6a8211d5a21454a2cf6ad783';
const code =
  "import{createRequire as c}from'node:module';const r=c('/app/services/authorization-service/package.json');const pg=r('pg');const d=process.env.PROBE_DISCORD_ID??'808066932753563668';const p=new pg.Pool({connectionString:process.env.AUTHORIZATION_DATABASE_URL??process.env.DATABASE_URL});const l=await p.query('SELECT discord_user_id,v2_user_id,linked_at FROM discord_identity_link WHERE discord_user_id=$1',[$1]);const all=await p.query('SELECT discord_user_id,v2_user_id,linked_at FROM discord_identity_link ORDER BY linked_at DESC LIMIT 20');console.log(JSON.stringify({discordId:d,links:l.rows,allLinks:all.rows}));await p.end();".replace(
    '$1',
    'd',
  );

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    'zeabur@latest',
    '-i=false',
    'service',
    'exec',
    '--id',
    authzServiceID,
    '--env-id',
    environmentID,
    '--',
    'node',
    '--input-type=module',
    '-e',
    code,
  ],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
);

process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
process.exit(result.status ?? 1);
