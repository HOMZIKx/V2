#!/usr/bin/env node
/** Find GraphQL mutations for postgres DB create; summarize identity DB ref. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const identityServiceID = '6a8211cfbdeaa87e2c52df39';
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
  if (value.includes('${')) return `REF:${value.replace(/\$\{/g, '{').replace(/\}/g, '}')}`;
  try {
    const u = new URL(value);
    return `URL host=${u.hostname} port=${u.port || '-'} db=${u.pathname}`;
  } catch {
    return `LEN=${value.length}`;
  }
}

const token = readToken();
const mut = await gql(token, `{ __type(name: "Mutation") { fields { name } } }`);
const names = (mut.data?.__type?.fields ?? [])
  .map((f) => f.name)
  .filter((n) => /postgres|database|sql|schema/i.test(n));
console.log('db mutations:', names.join(', ') || '(none)');

for (const [label, serviceID] of [
  ['identity', identityServiceID],
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
  for (const row of result.data?.service?.variables ?? []) {
    if (
      /DATABASE_URL|POSTGRES_DB|POSTGRES_HOST|SCHEMA/i.test(row.key) &&
      !/PASSWORD|PASS|SECRET|KEY|TOKEN/i.test(row.key)
    ) {
      console.log(`${label}.${row.key}: ${summarize(row.value)}`);
    }
  }
}
