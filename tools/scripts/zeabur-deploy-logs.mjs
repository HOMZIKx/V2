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

const deployResult = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 3) {
      edges { node { _id status commitSHA createdAt planMeta planType uploadID } }
    }
  }`,
  { serviceID, environmentID },
);
console.log(JSON.stringify(deployResult, null, 2));

const failed = deployResult.data?.deployments?.edges?.find((e) => e.node.status === 'FAILED')?.node;
if (failed) {
  const logs = await gql(
    token,
    `query($deploymentID: ObjectID!) {
      buildLogs(deploymentID: $deploymentID) { message timestamp }
    }`,
    { deploymentID: failed._id },
  );
  console.log('\n--- buildLogs attempt ---\n', JSON.stringify(logs, null, 2).slice(0, 8000));
}
