#!/usr/bin/env node
/** End-to-end Zeabur proof for player-workspace-service. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectID = '6a720a3e472e2c91a9e660d5';
const environmentID = '6a720a3e5f062718bc7b3421';
const pwServiceID = '6a9885bb573ada8b3bbe5f1f';
const apiGatewayServiceID = '6a8211c9bdeaa87e2c52df34';
const API = 'https://v2-api.zeabur.app';

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

async function httpProbe(label, url, init) {
  try {
    const response = await fetch(url, { ...init, redirect: 'manual' });
    const text = await response.text();
    console.log(
      `${label}: status=${response.status} body=${text.slice(0, 180).replace(/\s+/g, ' ')}`,
    );
    return { status: response.status, text };
  } catch (error) {
    console.log(`${label}: ERROR ${error instanceof Error ? error.message : error}`);
    return { status: 0, text: '' };
  }
}

const token = readToken();

const status = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    service(_id: $serviceID) {
      name
      status(environmentID: $environmentID)
    }
  }`,
  { serviceID: pwServiceID, environmentID },
);
console.log('PW status:', status.data?.service?.status);

const deploys = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 1) {
      edges { node { _id status commitSHA } }
    }
  }`,
  { serviceID: pwServiceID, environmentID },
);
const latest = deploys.data?.deployments?.edges?.[0]?.node;
console.log('PW deploy:', latest?.status, latest?.commitSHA?.slice(0, 12), latest?._id);

const logs = await gql(
  token,
  `query($projectID: ObjectID!, $serviceID: ObjectID!, $environmentID: ObjectID!, $deploymentID: ObjectID!) {
    runtimeLogs(
      projectID: $projectID
      serviceID: $serviceID
      environmentID: $environmentID
      deploymentID: $deploymentID
    ) { message timestamp }
  }`,
  { projectID, serviceID: pwServiceID, environmentID, deploymentID: latest._id },
);
const messages = (logs.data?.runtimeLogs ?? []).map((e) =>
  String(e.message).replace(/\u001b\[[0-9;]*m/g, ''),
);
const interesting = messages.filter((m) =>
  /migration|listen|error|DATABASE|ready|Nest application|Applied|NOOP|complete/i.test(m),
);
console.log('--- recent interesting logs ---');
for (const line of interesting.slice(0, 30)) console.log(line.slice(0, 240));

await httpProbe('GW /health/live', `${API}/health/live`);
await httpProbe('GW /player-workspace/v1/teams (no auth)', `${API}/player-workspace/v1/teams`);
await httpProbe('GW /player-workspace/v1/teams (bad bearer)', `${API}/player-workspace/v1/teams`, {
  headers: { authorization: 'Bearer invalid', 'x-correlation-id': 'pw-prove-1' },
});

// Restart proof: restart → wait → check migrate NOOP / still running
const restart = await gql(
  token,
  `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) {
    restartService(serviceID: $serviceID, environmentID: $environmentID)
  }`,
  { serviceID: pwServiceID, environmentID },
);
console.log('restart:', restart.errors?.[0]?.message ?? 'OK');
await new Promise((r) => setTimeout(r, 35_000));

const status2 = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    service(_id: $serviceID) { status(environmentID: $environmentID) }
  }`,
  { serviceID: pwServiceID, environmentID },
);
console.log('PW status after restart:', status2.data?.service?.status);

const logs2 = await gql(
  token,
  `query($projectID: ObjectID!, $serviceID: ObjectID!, $environmentID: ObjectID!, $deploymentID: ObjectID!) {
    runtimeLogs(
      projectID: $projectID
      serviceID: $serviceID
      environmentID: $environmentID
      deploymentID: $deploymentID
    ) { message timestamp }
  }`,
  { projectID, serviceID: pwServiceID, environmentID, deploymentID: latest._id },
);
const messages2 = (logs2.data?.runtimeLogs ?? []).map((e) =>
  String(e.message).replace(/\u001b\[[0-9;]*m/g, ''),
);
const afterRestart = messages2.filter((m) =>
  /migration|Applied|skipped|already|listen|DATABASE|error|refusing/i.test(m),
);
console.log('--- after restart interesting ---');
for (const line of afterRestart.slice(0, 25)) console.log(line.slice(0, 240));

await httpProbe('GW teams after restart (no auth)', `${API}/player-workspace/v1/teams`);

const apiStatus = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    service(_id: $serviceID) { status(environmentID: $environmentID) }
  }`,
  { serviceID: apiGatewayServiceID, environmentID },
);
console.log('API status:', apiStatus.data?.service?.status);
