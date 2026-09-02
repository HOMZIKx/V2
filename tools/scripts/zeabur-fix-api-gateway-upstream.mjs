#!/usr/bin/env node
/**
 * Set api-gateway upstream base URLs to Zeabur internal service DNS on port 8080.
 * Reports key names and success only — does not print existing secret values.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const apiGatewayServiceID = '6a8211c9bdeaa87e2c52df34';

const upstream = [
  {
    key: 'ACTIVITY_SERVICE_BASE_URL',
    value: 'http://service-6a8211c2a21454a2cf6ad77b:8080',
  },
  {
    key: 'IDENTITY_SERVICE_BASE_URL',
    value: 'http://service-6a8211cfbdeaa87e2c52df39:8080',
  },
];

function readToken() {
  const fromEnv = process.env.ZEABUR_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
  const match = yaml.match(/token:\s*(\S+)/);
  if (!match) throw new Error('No Zeabur token');
  return match[1];
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

for (const { key, value } of upstream) {
  const result = await gql(
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
    {
      serviceID: apiGatewayServiceID,
      environmentID,
      oldKey: key,
      newKey: key,
      value,
    },
  );
  if (result.errors?.length) {
    console.error(`${key}: FAILED — ${result.errors[0]?.message ?? 'unknown'}`);
    process.exitCode = 1;
  } else {
    console.log(`${key}: updated (internal :8080)`);
  }
}

const restart = await gql(
  token,
  `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) {
    restartService(serviceID: $serviceID, environmentID: $environmentID)
  }`,
  { serviceID: apiGatewayServiceID, environmentID },
);
if (restart.errors?.length) {
  console.error(`restart: FAILED — ${restart.errors[0]?.message ?? 'unknown'}`);
  process.exitCode = 1;
} else {
  console.log('api-gateway: restart requested');
}
