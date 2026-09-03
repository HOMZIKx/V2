#!/usr/bin/env node
/** List keys via service.variables GraphQL (no secret values printed). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const services = {
  activity: '6a8211c2a21454a2cf6ad77b',
  api: '6a8211c9bdeaa87e2c52df34',
  identity: '6a8211cfbdeaa87e2c52df39',
  pw: '6a9885bb573ada8b3bbe5f1f',
  postgres: '6a821138a21454a2cf6ad74d',
};

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

const pgMeta = await gql(
  token,
  `query($environmentID: ObjectID!, $serviceID: ObjectID) {
    postgresDatabases(environmentID: $environmentID, serviceID: $serviceID) {
      __typename
    }
  }`,
  { environmentID, serviceID: services.postgres },
);
console.log(
  'postgresDatabases typename probe:',
  JSON.stringify(pgMeta.errors ?? pgMeta.data).slice(0, 500),
);

const pgType = await gql(
  token,
  `{ __type(name: "PostgresDatabase") { fields { name type { name kind ofType { name } } } } }`,
);
console.log(
  'PostgresDatabase fields:',
  (pgType.data?.__type?.fields ?? []).map((f) => f.name).join(', ') || 'missing',
);

for (const [name, serviceID] of Object.entries(services)) {
  const result = await gql(
    token,
    `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
      service(_id: $serviceID) {
        name
        variables(environmentID: $environmentID) {
          key
          value
          exposed
          readonly
        }
      }
    }`,
    { serviceID, environmentID },
  );
  if (result.errors?.length) {
    console.log(`${name}: ERR ${result.errors[0].message}`);
    continue;
  }
  const vars = result.data?.service?.variables ?? [];
  const nonempty = vars.filter((v) => (v.value ?? '').length > 0);
  const dbKeys = vars.filter((v) => /DATABASE|POSTGRES|PASSWORD|URL|PORT|HOST/i.test(v.key));
  console.log(
    `${name}: total=${vars.length} nonempty=${nonempty.length} interesting=${dbKeys
      .map((v) => `${v.key}:${(v.value ?? '').length > 0 ? 'SET' : 'EMPTY'}:ro=${v.readonly}`)
      .join(' | ')}`,
  );
}
