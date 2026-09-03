#!/usr/bin/env node
/** Fix ownership AUD to https (match resolve URL pattern) and restart identity + PW. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const identityServiceID = '6a8211cfbdeaa87e2c52df39';
const pwServiceID = '6a9885bb573ada8b3bbe5f1f';
const ownershipAud = 'https://v2-api.zeabur.app/identity/v1/internal/character/ownership';

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
    if (create.errors?.length) throw new Error(`${key}: ${create.errors[0]?.message}`);
  }
  console.log(`${serviceID.slice(-6)} ${key}: OK`);
}

async function restart(token, serviceID, label) {
  const result = await gql(
    token,
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) {
      restartService(serviceID: $serviceID, environmentID: $environmentID)
    }`,
    { serviceID, environmentID },
  );
  if (result.errors?.length) throw new Error(`${label}: ${result.errors[0].message}`);
  console.log(`restart ${label}: OK`);
}

const token = readToken();
await setVar(token, identityServiceID, 'IDENTITY_CHARACTER_OWNERSHIP_URL', ownershipAud);
await setVar(token, pwServiceID, 'PLAYER_WORKSPACE_IDENTITY_OWNERSHIP_ASSERTION_AUD', ownershipAud);
await restart(token, identityServiceID, 'identity');
await restart(token, pwServiceID, 'pw');
await new Promise((r) => setTimeout(r, 40_000));

for (const [name, serviceID] of [
  ['identity', identityServiceID],
  ['pw', pwServiceID],
]) {
  const result = await gql(
    token,
    `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
      service(_id: $serviceID) { status(environmentID: $environmentID) }
      deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 1) {
        edges { node { status commitSHA } }
      }
    }`,
    { serviceID, environmentID },
  );
  const node = result.data?.deployments?.edges?.[0]?.node;
  console.log(
    `${name} status=${result.data?.service?.status} deploy=${node?.status} sha=${(node?.commitSHA ?? '').slice(0, 12)}`,
  );
}

const teams = await fetch('https://v2-api.zeabur.app/player-workspace/v1/teams');
console.log('teams-noauth', teams.status, (await teams.text()).slice(0, 180));
