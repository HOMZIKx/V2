#!/usr/bin/env node
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

const token = readToken();

const status = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    service(_id: $serviceID) {
      name
      status(environmentID: $environmentID)
      domains(environmentID: $environmentID) { domain }
    }
  }`,
  { serviceID: pwServiceID, environmentID },
);
console.log('PW:', JSON.stringify(status.data?.service ?? status.errors));

const api = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    service(_id: $serviceID) {
      name
      status(environmentID: $environmentID)
      domains(environmentID: $environmentID) { domain }
    }
  }`,
  { serviceID: apiGatewayServiceID, environmentID },
);
console.log('API:', JSON.stringify(api.data?.service ?? api.errors));

const deploys = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 3) {
      edges { node { _id status commitSHA createdAt } }
    }
  }`,
  { serviceID: pwServiceID, environmentID },
);
const latest = deploys.data?.deployments?.edges?.[0]?.node;
console.log('latest deploy', latest);

if (latest?._id) {
  const logs = await gql(
    token,
    `query($serviceID: ObjectID!, $environmentID: ObjectID!, $deploymentID: ObjectID!) {
      runtimeLogs(serviceID: $serviceID, environmentID: $environmentID, deploymentID: $deploymentID) {
        message timestamp stream
      }
    }`,
    { serviceID: pwServiceID, environmentID, deploymentID: latest._id },
  );
  console.log(
    'deploy runtime count',
    (logs.data?.runtimeLogs ?? []).length,
    logs.errors?.[0]?.message ?? '',
  );
  for (const e of (logs.data?.runtimeLogs ?? []).slice(-50)) {
    console.log(String(e.message).replace(/\u001b\[[0-9;]*m/g, ''));
  }
}

const build = await gql(
  token,
  `query($deploymentID: ObjectID!) {
    buildLogs(deploymentID: $deploymentID) { message }
  }`,
  { deploymentID: latest?._id },
);
if (build.errors) console.log('buildLogs err', build.errors[0]?.message);
else {
  const msgs = (build.data?.buildLogs ?? []).map((l) => l.message).join('\n');
  const tail = msgs.slice(-2500);
  console.log('buildLogs tail:\n', tail);
}
