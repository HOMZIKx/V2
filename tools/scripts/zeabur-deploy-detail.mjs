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
      edges { node { _id status commitSHA createdAt planMeta buildJob { _id status } } }
    }
  }`,
  { serviceID, environmentID },
);
const deployment = deployResult.data?.deployments?.edges?.[0]?.node;
console.log('Latest deployment:', JSON.stringify(deployment, null, 2));

if (deployment?._id) {
  const detail = await gql(
    token,
    `query($deploymentID: ObjectID!) {
      deployment(_id: $deploymentID) {
        _id status commitSHA createdAt planMeta
        buildJob { _id status failureReason }
      }
    }`,
    { deploymentID: deployment._id },
  );
  console.log('\nDetail:', JSON.stringify(detail, null, 2));
}

// introspect deployment type
const typeResult = await gql(
  token,
  `{ __type(name: "Deployment") { fields { name type { name kind ofType { name } } } } }`,
);
console.log(
  '\nDeployment fields:',
  (typeResult.data?.__type?.fields ?? []).map((f) => f.name).join(', '),
);
