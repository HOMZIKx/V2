#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const environmentID = '6a720a3e5f062718bc7b3421';
const activityServiceID = '6a8211c2a21454a2cf6ad77b';
const code =
  "import{createRequire as c}from'node:module';const r=c('/app/services/activity-service/package.json');const pg=r('pg');const p=new pg.Pool({connectionString:process.env.ACTIVITY_DATABASE_URL});const w=await p.query(`select id,status,seeker_discord_user_id from lfg_watches where guild_id='1534228693017432124' order by created_at desc limit 5`);const a=await p.query(`select opaque_id,status,activity_type_key,organizer_discord_user_id from activities where guild_id='1534228693017432124' and status='published' order by created_at desc limit 5`);const o=await p.query(`select status,count(*)::int c from outbox_messages group by status order by status`);console.log(JSON.stringify({watches:w.rows,activities:a.rows,outbox:o.rows}));await p.end();";

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
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
    'node',
    '--input-type=module',
    '-e',
    code,
  ],
  { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
);

process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
process.exit(result.status ?? 1);
