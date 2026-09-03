#!/usr/bin/env node
/** Snapshot PW/API/Identity status + unauthorized probe (no secrets). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const services = [
  ['pw', '6a9885bb573ada8b3bbe5f1f'],
  ['api', '6a8211c9bdeaa87e2c52df34'],
  ['identity', '6a8211cfbdeaa87e2c52df39'],
];

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
for (const [name, serviceID] of services) {
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
    `${name}\tstatus=${result.data?.service?.status}\tdeploy=${node?.status}\tsha=${(node?.commitSHA ?? '').slice(0, 12)}`,
  );
}

const live = await fetch('https://v2-api.zeabur.app/health/live');
console.log('api-live', live.status, (await live.text()).slice(0, 140));
const teams = await fetch('https://v2-api.zeabur.app/player-workspace/v1/teams');
console.log('teams-noauth', teams.status, (await teams.text()).slice(0, 180));
