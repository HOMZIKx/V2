#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';

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
const serviceID = process.argv[2] ?? '6a8211a6bdeaa87e2c52df28';

const result = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    service(_id: $serviceID) {
      name
      template
      spec { source { type dockerfile } }
    }
    variables(serviceID: $serviceID, environmentID: $environmentID) {
      edges { node { key value exposed } }
    }
  }`,
  { serviceID, environmentID },
);

console.log(JSON.stringify(result, null, 2));

const zbpack = (result.data?.variables?.edges ?? [])
  .map((e) => e.node)
  .filter((v) => /ZBPACK|DOCKER/i.test(v.key));
console.log('\nZBPACK/DOCKER vars:', zbpack);
