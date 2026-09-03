#!/usr/bin/env node
/** Show identity ownership/resolve URL shapes (hosts only). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const identityServiceID = '6a8211cfbdeaa87e2c52df39';
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

function summarize(value) {
  if (!value) return 'EMPTY';
  if (value.includes('${')) return `REF`;
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.hostname}${u.pathname}`;
  } catch {
    return `LEN=${value.length}`;
  }
}

const token = readToken();
for (const [name, serviceID] of [
  ['identity', identityServiceID],
  ['pw', pwServiceID],
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
    if (/OWNERSHIP|CHARACTER_RESOLVE|ASSERTION_AUD|IDENTITY_BASE/i.test(row.key)) {
      console.log(`${name}.${row.key}: ${summarize(row.value)}`);
    }
  }
}
