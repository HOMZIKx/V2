#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const pwServiceID = '6a9885bb573ada8b3bbe5f1f';

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

for (const typeName of ['ServiceStatus', 'Deployment', 'RuntimeLog']) {
  const t = await gql(
    token,
    `query($n: String!) { __type(name: $n) { name fields { name } enumValues { name } } }`,
    { n: typeName },
  );
  const type = t.data?.__type;
  if (!type) {
    console.log(typeName, 'missing');
    continue;
  }
  console.log(
    typeName,
    'fields=',
    (type.fields ?? []).map((f) => f.name).join(',') || '-',
    'enums=',
    (type.enumValues ?? []).map((e) => e.name).join(',') || '-',
  );
}

const status = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    service(_id: $serviceID) {
      name
      status(environmentID: $environmentID)
      domains(environmentID: $environmentID) { domain }
      podStatuses(environmentID: $environmentID) { status ready }
    }
  }`,
  { serviceID: pwServiceID, environmentID },
);
console.log('status:', JSON.stringify(status.data ?? status.errors, null, 2));

const deploys = await gql(
  token,
  `query($serviceID: ObjectID!) {
    service(_id: $serviceID) {
      deployments(limit: 5) {
        edges {
          node {
            _id
            status
            createdAt
          }
        }
      }
    }
  }`,
  { serviceID: pwServiceID },
);
console.log('deploys:', JSON.stringify(deploys.data ?? deploys.errors, null, 2));

const runtime = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    runtimeLogs(serviceID: $serviceID, environmentID: $environmentID) {
      message timestamp
    }
  }`,
  { serviceID: pwServiceID, environmentID },
);
console.log('runtime count', (runtime.data?.runtimeLogs ?? []).length);
console.log('runtime err', runtime.errors?.[0]?.message ?? 'none');
for (const e of (runtime.data?.runtimeLogs ?? []).slice(-40)) {
  console.log(String(e.message).replace(/\u001b\[[0-9;]*m/g, ''));
}
