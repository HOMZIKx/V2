#!/usr/bin/env node
/** Temporarily disable identity authz gate so identity boots before deploy with internal-URL fix. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const identityServiceID = '6a8211cfbdeaa87e2c52df39';

function readToken() {
  const fromEnv = process.env.ZEABUR_TOKEN?.trim();
  if (fromEnv) return fromEnv;
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

async function setVar(token, key, value) {
  const update = await gql(
    token,
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!, $oldKey: String!, $newKey: String!, $value: String!) {
      updateSingleEnvironmentVariable(serviceID: $serviceID, environmentID: $environmentID, oldKey: $oldKey, newKey: $newKey, value: $value) { key }
    }`,
    { serviceID: identityServiceID, environmentID, oldKey: key, newKey: key, value },
  );
  if (update.errors?.length) throw new Error(`${key}: update failed`);
  console.log(`${key}=false (recovery)`);
}

const token = readToken();
if (!token) {
  console.error('No Zeabur token');
  process.exit(1);
}

await setVar(token, 'IDENTITY_AUTHORIZATION_ENABLED', 'false');
const restart = await gql(
  token,
  `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) { restartService(serviceID: $serviceID, environmentID: $environmentID) }`,
  { serviceID: identityServiceID, environmentID },
);
console.log('restart:', restart.data?.restartService === true ? 'ok' : 'fail');
