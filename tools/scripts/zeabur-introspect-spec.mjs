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
for (const typeName of ['DeploymentSpecification', 'ServiceSpecInput', 'ServiceSpecSourceInput']) {
  const t = await gql(
    token,
    `{ __type(name: "${typeName}") { inputFields { name type { kind name ofType { name kind ofType { name } } } } } }`,
  );
  console.log(
    `\n${typeName}:`,
    JSON.stringify(
      t.data?.__type?.inputFields?.map((f) => f.name),
      null,
      2,
    ),
  );
}

const deployField = await gql(
  token,
  `{ __type(name: "Mutation") { fields(includeDeprecated: true) { name args { name type { kind name ofType { name kind ofType { name ofType { name } } } } } } } }`,
);
const deploy = (deployField.data?.__type?.fields ?? []).find(
  (f) => f.name === 'deployFromSpecification',
);
console.log('\ndeployFromSpecification args:', JSON.stringify(deploy?.args, null, 2));
