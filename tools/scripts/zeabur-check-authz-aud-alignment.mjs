#!/usr/bin/env node
/** Safe aud alignment check — prints booleans only, no secret values. */
import { spawnSync } from 'node:child_process';

const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const activityServiceID = '6a8211c2a21454a2cf6ad77b';
const authzServiceID = '6a8211d5a21454a2cf6ad783';

function listVars(serviceID) {
  const listed = spawnSync(
    'npx',
    [
      'zeabur@latest',
      '-i=false',
      'variable',
      'list',
      '--id',
      serviceID,
      '--env-id',
      environmentID,
      '--json',
    ],
    { encoding: 'utf8', shell: true },
  );
  const jsonStart = listed.stdout.indexOf('{');
  const parsed = JSON.parse(listed.stdout.slice(jsonStart));
  const map = new Map();
  for (const row of [...(parsed.variables ?? []), ...(parsed.readonlyVariables ?? [])]) {
    map.set(row.key, row.value ?? '');
  }
  return map;
}

const activity = listVars(activityServiceID);
const authz = listVars(authzServiceID);
const activityAud = activity.get('ACTIVITY_AUTHORIZATION_ASSERTION_AUD')?.trim() ?? '';
const authzAud = authz.get('AUTHORIZATION_ASSERTION_AUD')?.trim() ?? '';
const internalExpected = `http://service-${authzServiceID}:8080/authorization/v1/authorize`;
console.log('activity_aud_set', activityAud.length > 0);
console.log('authz_aud_set', authzAud.length > 0);
console.log('aud_exact_match', activityAud.length > 0 && activityAud === authzAud);
console.log(
  'activity_aud_matches_internal_fallback',
  activityAud.length > 0 && activityAud === internalExpected,
);
console.log(
  'activity_authz_base_internal',
  activity.get('ACTIVITY_AUTHORIZATION_BASE_URL')?.includes(':8080') === true,
);
