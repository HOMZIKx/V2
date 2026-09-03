#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const serviceID = '6a8211c9bdeaa87e2cf6ad34';

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
const t = await gql(token, `{ __type(name: "Query") { fields { name args { name } } } }`);
const envFields = (t.data?.__type?.fields ?? []).filter((f) => /env|variable/i.test(f.name));
console.log(envFields.map((f) => f.name));

const tryQueries = [
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    environmentVariables(serviceID: $serviceID, environmentID: $environmentID) { key value }
  }`,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    service(_id: $serviceID) {
      environmentVariables(environmentID: $environmentID) { key value }
    }
  }`,
];

for (const query of tryQueries) {
  const r = await gql(token, query, { serviceID, environmentID });
  if (r.data && !r.errors) {
    console.log(JSON.stringify(r.data, null, 2).slice(0, 3000));
    break;
  } else if (r.errors) {
    console.log('err:', r.errors[0]?.message);
  }
}
