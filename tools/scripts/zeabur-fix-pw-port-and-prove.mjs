#!/usr/bin/env node
/** Fix PW listen port + gateway base URL to concrete 8080; restart; print recent logs. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const pwServiceID = '6a9885bb573ada8b3bbe5f1f';
const apiGatewayServiceID = '6a8211c9bdeaa87e2c52df34';

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

async function setVar(token, serviceID, key, value) {
  const update = await gql(
    token,
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!, $oldKey: String!, $newKey: String!, $value: String!) {
      updateSingleEnvironmentVariable(
        serviceID: $serviceID
        environmentID: $environmentID
        oldKey: $oldKey
        newKey: $newKey
        value: $value
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
    if (create.errors?.length) throw new Error(`${key}: ${create.errors[0]?.message}`);
  }
  console.log(`${serviceID.slice(-6)} ${key}: OK`);
}

const token = readToken();
const listenPort = '8080';
const pwBase = `http://service-${pwServiceID}:${listenPort}`;

await setVar(token, pwServiceID, 'PLAYER_WORKSPACE_SERVICE_PORT', listenPort);
await setVar(token, apiGatewayServiceID, 'PLAYER_WORKSPACE_SERVICE_BASE_URL', pwBase);
console.log('base set to', pwBase);

for (const [id, label] of [
  [pwServiceID, 'pw'],
  [apiGatewayServiceID, 'api'],
]) {
  const r = await gql(
    token,
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) {
      restartService(serviceID: $serviceID, environmentID: $environmentID)
    }`,
    { serviceID: id, environmentID },
  );
  if (r.errors?.length) throw new Error(`${label}: ${r.errors[0].message}`);
  console.log(`restart ${label}: OK`);
}

await new Promise((r) => setTimeout(r, 25_000));

const runtime = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    runtimeLogs(serviceID: $serviceID, environmentID: $environmentID) {
      message timestamp
    }
  }`,
  { serviceID: pwServiceID, environmentID },
);
const lines = runtime.data?.runtimeLogs ?? [];
for (const e of lines.slice(-80)) {
  console.log(String(e.message).replace(/\u001b\[[0-9;]*m/g, ''));
}
