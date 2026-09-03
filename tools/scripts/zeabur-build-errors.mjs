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
    deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 1) {
      edges { node { _id status } }
    }
  }`,
  { serviceID, environmentID },
);
const deploymentID = deployResult.data?.deployments?.edges?.[0]?.node?._id;
console.log('deployment:', deploymentID);

const logs = await gql(
  token,
  `query($deploymentID: ObjectID!) {
    buildLogs(deploymentID: $deploymentID) { message timestamp }
  }`,
  { deploymentID },
);

for (const entry of (logs.data?.buildLogs ?? []).reverse()) {
  if (/ERR|error|WARN|pnpm|lock|ENOENT|filter|failed/i.test(entry.message)) {
    console.log(entry.message.replace(/\u001b\[[0-9;]*m/g, ''));
  }
}
