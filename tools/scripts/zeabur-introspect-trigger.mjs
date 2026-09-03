#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
const t = await gql(
  token,
  `{ __type(name: "Mutation") { fields { name args { name type { kind name ofType { name kind ofType { name } } } } } } }`,
);
for (const name of ['triggerCICDSource', 'createCICDSource', 'updateCICDSource']) {
  const f = (t.data?.__type?.fields ?? []).find((x) => x.name === name);
  console.log(`\n${name}:`, JSON.stringify(f?.args, null, 2));
}

const cicd = await gql(
  token,
  `{ __type(name: "TriggerCICDSourceInput") { inputFields { name type { kind name ofType { name } } } } }`,
);
console.log('\nTriggerCICDSourceInput:', JSON.stringify(cicd.data?.__type?.inputFields, null, 2));
