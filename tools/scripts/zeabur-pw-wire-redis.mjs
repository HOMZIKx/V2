#!/usr/bin/env node
/** Set PLAYER_WORKSPACE_REDIS_URL from activity Redis and restart PW. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const activityServiceID = '6a8211c2a21454a2cf6ad77b';
const pwServiceID = '6a9885bb573ada8b3bbe5f1f';

function readToken() {
  const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
  return yaml.match(/token:\s*(\S+)/)?.[1];
}

async function gql(token, query, variables = {}) {
  const response = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

async function listVars(token, serviceID) {
  const result = await gql(
    token,
    `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
      service(_id: $serviceID) {
        variables(environmentID: $environmentID) { key value }
      }
    }`,
    { serviceID, environmentID },
  );
  return new Map((result.data?.service?.variables ?? []).map((row) => [row.key, row.value ?? '']));
}

async function setVar(token, serviceID, key, value) {
  const update = await gql(
    token,
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!, $oldKey: String!, $newKey: String!, $value: String!) {
      updateSingleEnvironmentVariable(
        serviceID: $serviceID environmentID: $environmentID oldKey: $oldKey newKey: $newKey value: $value
      ) { key }
    }`,
    { serviceID, environmentID, oldKey: key, newKey: key, value },
  );
  if (update.errors?.length) {
    const create = await gql(
      token,
      `mutation($serviceID: ObjectID!, $environmentID: ObjectID!, $key: String!, $value: String!) {
        createEnvironmentVariable(serviceID: $serviceID, environmentID: $environmentID, key: $key, value: $value) { key }
      }`,
      { serviceID, environmentID, key, value },
    );
    if (create.errors?.length) throw new Error(create.errors[0]?.message ?? 'set failed');
  }
  console.log(`${key}: OK`);
}

const token = readToken();
const activityVars = await listVars(token, activityServiceID);
const redis =
  activityVars.get('ACTIVITY_REDIS_URL')?.trim() || activityVars.get('REDIS_URL')?.trim() || '';
if (!redis) {
  console.error('No Redis URL on activity-service');
  process.exit(1);
}
const shape = redis.includes('${')
  ? `REF ${redis.replace(/\$\{([^}]+)\}/g, '{$1}')}`
  : (() => {
      try {
        const u = new URL(redis);
        return `${u.protocol}//${u.hostname}:${u.port || '-'}`;
      } catch {
        return `LEN=${redis.length}`;
      }
    })();
console.log('redis shape:', shape);

await setVar(token, pwServiceID, 'PLAYER_WORKSPACE_REDIS_URL', redis);
const restart = await gql(
  token,
  `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) {
    restartService(serviceID: $serviceID, environmentID: $environmentID)
  }`,
  { serviceID: pwServiceID, environmentID },
);
console.log('restart:', restart.errors?.[0]?.message ?? 'OK');
await new Promise((r) => setTimeout(r, 25_000));

for (const [label, url, headers] of [
  ['no-auth', 'https://v2-api.zeabur.app/player-workspace/v1/teams', {}],
  [
    'bad-bearer',
    'https://v2-api.zeabur.app/player-workspace/v1/teams',
    { authorization: 'Bearer invalid' },
  ],
]) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  console.log(`${label}: ${res.status} ${text.slice(0, 200)}`);
}
