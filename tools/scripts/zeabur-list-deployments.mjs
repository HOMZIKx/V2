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
const result = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 10) {
      edges { node { _id status commitSHA createdAt } }
    }
  }`,
  { serviceID, environmentID },
);
for (const e of result.data?.deployments?.edges ?? []) {
  console.log(
    `${e.node.status} ${e.node.createdAt} ${e.node._id} sha=${(e.node.commitSHA ?? '').slice(0, 12)}`,
  );
}
