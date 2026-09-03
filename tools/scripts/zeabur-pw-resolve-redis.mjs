#!/usr/bin/env node
/** Resolve concrete Redis URL for PW and restart; then probe unauthorized. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const redisServiceID = '6a82113da21454a2cf6ad75a';
const activityServiceID = '6a8211c2a21454a2cf6ad77b';
const pwServiceID = '6a9885bb573ada8b3bbe5f1f';
const projectID = '6a720a3e472e2c91a9e660d5';

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

function resolveRef(value, maps) {
  let current = value ?? '';
  for (let i = 0; i < 10; i += 1) {
    if (!current.includes('${')) return current;
    current = current.replace(/\$\{([^}]+)\}/g, (_, key) => {
      for (const map of maps) {
        if (map.has(key)) return map.get(key) ?? '';
      }
      return '';
    });
  }
  return current;
}

function summarize(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}:${u.port || '-'}`;
  } catch {
    return `unparseable len=${url.length}`;
  }
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
const redisVars = await listVars(token, redisServiceID);
const activityVars = await listVars(token, activityServiceID);
const pwVars = await listVars(token, pwServiceID);
const maps = [redisVars, activityVars, pwVars];

for (const [label, map] of [
  ['redis', redisVars],
  ['activity', activityVars],
]) {
  for (const [key, value] of map) {
    if (/REDIS|PASSWORD/i.test(key) && !/PRIVATE_KEY|PEM|SECRET_KEY/i.test(key)) {
      const resolved = resolveRef(value, maps);
      const kind = value.includes('${') ? 'REF' : 'RAW';
      const looksUrl = /redis:\/\//i.test(resolved) || /rediss:\/\//i.test(resolved);
      console.log(
        `${label}.${key}: ${kind} resolved=${looksUrl ? summarize(resolved) : `len=${resolved.length}`}`,
      );
    }
  }
}

const candidate =
  resolveRef(activityVars.get('ACTIVITY_REDIS_URL'), maps) ||
  resolveRef(redisVars.get('REDIS_CONNECTION_STRING'), maps) ||
  resolveRef(redisVars.get('REDIS_URI'), maps) ||
  resolveRef(redisVars.get('REDIS_URL'), maps);

if (!candidate || !/^rediss?:\/\//i.test(candidate)) {
  // Build manually
  const host =
    resolveRef(activityVars.get('REDIS_HOST') || redisVars.get('REDIS_HOST'), maps) ||
    `service-${redisServiceID}`;
  const port =
    resolveRef(activityVars.get('REDIS_PORT') || redisVars.get('REDIS_PORT'), maps) || '6379';
  const password = resolveRef(redisVars.get('REDIS_PASSWORD') || redisVars.get('PASSWORD'), maps);
  const built = password
    ? `redis://:${encodeURIComponent(password)}@${host}:${port}`
    : `redis://${host}:${port}`;
  console.log('built redis:', summarize(built));
  await setVar(token, pwServiceID, 'PLAYER_WORKSPACE_REDIS_URL', built);
} else {
  console.log('resolved redis:', summarize(candidate));
  await setVar(token, pwServiceID, 'PLAYER_WORKSPACE_REDIS_URL', candidate);
}

await gql(
  token,
  `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) {
    restartService(serviceID: $serviceID, environmentID: $environmentID)
  }`,
  { serviceID: pwServiceID, environmentID },
);
console.log('restart OK, waiting…');
await new Promise((r) => setTimeout(r, 30_000));

const deploys = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 1) {
      edges { node { _id status commitSHA } }
    }
    service(_id: $serviceID) { status(environmentID: $environmentID) }
  }`,
  { serviceID: pwServiceID, environmentID },
);
const latest = deploys.data?.deployments?.edges?.[0]?.node;
console.log('PW', deploys.data?.service?.status, latest?.commitSHA?.slice(0, 12));

const logs = await gql(
  token,
  `query($projectID: ObjectID!, $serviceID: ObjectID!, $environmentID: ObjectID!, $deploymentID: ObjectID!) {
    runtimeLogs(projectID: $projectID, serviceID: $serviceID, environmentID: $environmentID, deploymentID: $deploymentID) {
      message
    }
  }`,
  { projectID, serviceID: pwServiceID, environmentID, deploymentID: latest._id },
);
for (const e of (logs.data?.runtimeLogs ?? []).slice(0, 15)) {
  const m = String(e.message).replace(/\u001b\[[0-9;]*m/g, '');
  if (/listen|migration|error|REDIS|replay|CONFIG/i.test(m)) console.log(m.slice(0, 220));
}

for (const [label, headers] of [
  ['no-auth', {}],
  ['bad-bearer', { authorization: 'Bearer invalid' }],
]) {
  const res = await fetch('https://v2-api.zeabur.app/player-workspace/v1/teams', { headers });
  console.log(`${label}: ${res.status} ${(await res.text()).slice(0, 220)}`);
}
