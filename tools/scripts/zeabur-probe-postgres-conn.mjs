#!/usr/bin/env node
/** Resolve Zeabur postgres connection shape (host/db only, no secrets). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const postgresServiceID = '6a821138a21454a2cf6ad74d';
const activityServiceID = '6a8211c2a21454a2cf6ad77b';

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

function summarize(value) {
  if (!value) return 'EMPTY';
  if (value.includes('${')) return `REF:${value.replace(/\$\{([^}]+)\}/g, '{$1}')}`;
  try {
    const u = new URL(value);
    return `URL proto=${u.protocol} host=${u.hostname} port=${u.port || '-'} db=${u.pathname}`;
  } catch {
    return `LEN=${value.length} PREFIX=${value.slice(0, 12)}`;
  }
}

const token = readToken();
for (const [label, serviceID] of [
  ['postgres', postgresServiceID],
  ['activity', activityServiceID],
]) {
  const result = await gql(
    token,
    `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
      service(_id: $serviceID) {
        variables(environmentID: $environmentID) { key value }
      }
    }`,
    { serviceID, environmentID },
  );
  const vars = result.data?.service?.variables ?? [];
  for (const row of vars) {
    if (/POSTGRES|DATABASE|PASSWORD|CONNECTION|URI/i.test(row.key)) {
      console.log(`${label}.${row.key}: ${summarize(row.value)}`);
    }
  }
}

const pgDbs = await gql(
  token,
  `query($environmentID: ObjectID!, $serviceID: ObjectID!) {
    postgresDatabases(environmentID: $environmentID, serviceID: $serviceID) {
      name
    }
  }`,
  { environmentID, serviceID: postgresServiceID },
);
console.log('postgresDatabases:', JSON.stringify(pgDbs.data ?? pgDbs.errors));
