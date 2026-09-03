#!/usr/bin/env node
/** List Zeabur variable KEYS only (no values) + Variable GraphQL shape. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const projectID = '6a720a3e472e2c91a9e660d5';
const activityServiceID = '6a8211c2a21454a2cf6ad77b';
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
const typeInfo = await gql(token, `{ __type(name: "Query") { fields { name } } }`);
const qNames = (typeInfo.data?.__type?.fields ?? [])
  .map((f) => f.name)
  .filter((n) => /var|env|secret/i.test(n));
console.log('query fields:', qNames.join(', '));

for (const typeName of ['Variable', 'EnvironmentVariable', 'ServiceVariable']) {
  const t = await gql(token, `query($n: String!) { __type(name: $n) { name fields { name } } }`, {
    n: typeName,
  });
  if (t.data?.__type) {
    console.log(typeName, (t.data.__type.fields ?? []).map((f) => f.name).join(','));
  }
}

for (const serviceID of [activityServiceID, pwServiceID]) {
  const result = await gql(
    token,
    `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
      variables(serviceID: $serviceID, environmentID: $environmentID) {
        edges { node { key value exposed } }
      }
    }`,
    { serviceID, environmentID },
  );
  const edges = result.data?.variables?.edges ?? [];
  const keys = edges.map((e) => e.node.key);
  const nonempty = edges.filter((e) => (e.node.value ?? '').length > 0).map((e) => e.node.key);
  console.log(`service ${serviceID.slice(-6)} keys=${keys.length} nonempty=${nonempty.length}`);
  console.log('  keys:', keys.join(', '));
  console.log('  nonempty:', nonempty.join(', '));
  if (result.errors) console.log('  errors:', result.errors[0]?.message);
}

const services = await gql(
  token,
  `query($projectID: ObjectID!) {
    services(projectID: $projectID) { edges { node { _id name template } } }
  }`,
  { projectID },
);
for (const edge of services.data?.services?.edges ?? []) {
  console.log(`${edge.node.name}\t${edge.node._id}\t${edge.node.template}`);
}
