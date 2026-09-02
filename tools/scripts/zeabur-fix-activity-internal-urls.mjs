#!/usr/bin/env node
/**
 * Set activity-service internal upstream URLs (Authorization, Identity, Discord) to :8080 service DNS.
 * Also fixes identity-service IDENTITY_AUTHORIZATION_BASE_URL when needed.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const activityServiceID = '6a8211c2a21454a2cf6ad77b';
const identityServiceID = '6a8211cfbdeaa87e2c52df39';
const authzServiceID = '6a8211d5a21454a2cf6ad783';
const discordServiceID = '6a8211a6bdeaa87e2c52df28';

const activityUpdates = [
  { key: 'ACTIVITY_AUTHORIZATION_BASE_URL', value: `http://service-${authzServiceID}:8080` },
  { key: 'ACTIVITY_IDENTITY_BASE_URL', value: `http://service-${identityServiceID}:8080` },
  {
    key: 'ACTIVITY_DISCORD_PROJECTION_BASE_URL',
    value: `http://service-${discordServiceID}:8080`,
  },
  {
    key: 'ACTIVITY_DISCORD_GATEWAY_BASE_URL',
    value: `http://service-${discordServiceID}:8080`,
  },
];

const identityUpdates = [
  { key: 'IDENTITY_AUTHORIZATION_BASE_URL', value: `http://service-${authzServiceID}:8080` },
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
    if (create.errors?.length) {
      throw new Error(`${key}: ${create.errors[0]?.message ?? update.errors[0]?.message}`);
    }
  }
  console.log(`${serviceID.slice(-6)} ${key}: OK`);
}

async function restart(token, serviceID) {
  const result = await gql(
    token,
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) {
      restartService(serviceID: $serviceID, environmentID: $environmentID)
    }`,
    { serviceID, environmentID },
  );
  console.log(
    `restart ${serviceID.slice(-6)}:`,
    result.data?.restartService === true ? 'ok' : 'fail',
  );
}

const token = readToken();
for (const row of activityUpdates) {
  await setVar(token, activityServiceID, row.key, row.value);
}
for (const row of identityUpdates) {
  await setVar(token, identityServiceID, row.key, row.value);
}
await restart(token, activityServiceID);
await restart(token, identityServiceID);
