#!/usr/bin/env node
/** Final Zeabur proofs: status, healthCheck, restart NOOP, unauthorized, identity. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectID = '6a720a3e472e2c91a9e660d5';
const environmentID = '6a720a3e5f062718bc7b3421';
const pwServiceID = '6a9885bb573ada8b3bbe5f1f';
const apiGatewayServiceID = '6a8211c9bdeaa87e2c52df34';
const identityServiceID = '6a8211cfbdeaa87e2c52df39';

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

const hcType = await gql(token, `{ __type(name: "Service") { fields { name args { name } } } }`);
const hcField = (hcType.data?.__type?.fields ?? []).find((f) => f.name === 'healthCheckV2');
console.log('healthCheckV2 args', (hcField?.args ?? []).map((a) => a.name).join(','));

const statusBundle = await gql(
  token,
  `query($pw: ObjectID!, $api: ObjectID!, $id: ObjectID!, $e: ObjectID!) {
    pw: service(_id: $pw) { name status(environmentID: $e) }
    api: service(_id: $api) { name status(environmentID: $e) }
    identity: service(_id: $id) { name status(environmentID: $e) }
  }`,
  { pw: pwServiceID, api: apiGatewayServiceID, id: identityServiceID, e: environmentID },
);
console.log(JSON.stringify(statusBundle.data, null, 2));

for (const [name, serviceID] of [
  ['pw', pwServiceID],
  ['api', apiGatewayServiceID],
  ['identity', identityServiceID],
]) {
  const d = await gql(
    token,
    `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
      deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 1) {
        edges { node { status commitSHA } }
      }
    }`,
    { serviceID, environmentID },
  );
  const n = d.data?.deployments?.edges?.[0]?.node;
  console.log(`${name} deploy ${n?.status} ${(n?.commitSHA ?? '').slice(0, 12)}`);
}

const hc = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    service(_id: $serviceID) {
      healthCheckV2(environmentID: $environmentID)
    }
  }`,
  { serviceID: pwServiceID, environmentID },
);
console.log('healthCheckV2:', JSON.stringify(hc.data ?? hc.errors));

await gql(
  token,
  `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) {
    restartService(serviceID: $serviceID, environmentID: $environmentID)
  }`,
  { serviceID: pwServiceID, environmentID },
);
console.log('restart issued, waiting 40s…');
await new Promise((r) => setTimeout(r, 40_000));

const after = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    service(_id: $serviceID) { status(environmentID: $environmentID) }
    deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 1) {
      edges { node { _id status commitSHA } }
    }
  }`,
  { serviceID: pwServiceID, environmentID },
);
const latest = after.data?.deployments?.edges?.[0]?.node;
console.log('after restart status', after.data?.service?.status);

const logs = await gql(
  token,
  `query($projectID: ObjectID!, $serviceID: ObjectID!, $environmentID: ObjectID!, $deploymentID: ObjectID!) {
    runtimeLogs(projectID: $projectID, serviceID: $serviceID, environmentID: $environmentID, deploymentID: $deploymentID) {
      message
    }
  }`,
  { projectID, serviceID: pwServiceID, environmentID, deploymentID: latest._id },
);
let skipped = false;
let listen = false;
for (const e of logs.data?.runtimeLogs ?? []) {
  let m = String(e.message).replace(/\u001b\[[0-9;]*m/g, '');
  m = m.replace(/redis:\/\/:[^@\s]+@/gi, 'redis://:[REDACTED]@');
  m = m.replace(/postgresql:\/\/[^@\s]+@/gi, 'postgresql://[REDACTED]@');
  if (/skipped 001_player_workspace|Applied 0, total 1/i.test(m)) skipped = true;
  if (/"event":"listen"|Player Workspace Service started/i.test(m)) listen = true;
  if (/skipped|Applied 0|listen|migrations complete|Exception|error/i.test(m)) {
    console.log(m.slice(0, 200));
  }
}
console.log('RESTART_PROOF skipped_migrate=', skipped, 'listen=', listen);

const live = await fetch('https://v2-api.zeabur.app/health/live');
console.log('api live', live.status, (await live.text()).slice(0, 160));
const teams = await fetch('https://v2-api.zeabur.app/player-workspace/v1/teams');
console.log('teams no-auth', teams.status, (await teams.text()).slice(0, 200));
