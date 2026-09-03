#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const serviceID = process.argv[2] ?? '6a8211a6bdeaa87e2c52df28';

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

const token = readToken();
for (const [name, query] of [
  [
    'restart',
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) { restartService(serviceID: $serviceID, environmentID: $environmentID) }`,
  ],
  [
    'redeploy',
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) { redeployService(serviceID: $serviceID, environmentID: $environmentID) }`,
  ],
]) {
  const result = await gql(token, query, { serviceID, environmentID });
  console.log(name, JSON.stringify(result.data ?? result.errors));
}
