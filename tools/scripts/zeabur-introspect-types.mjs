#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function readToken() {
  const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
  return yaml.match(/token:\s*(\S+)/)?.[1];
}

async function gql(token, query) {
  const response = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query }),
  });
  return response.json();
}

const token = readToken();
for (const typeName of [
  'TriggerCICDSourceInput',
  'DeploymentSpecification',
  'ServiceSpecGitSource',
  'CreateCICDBuildInput',
]) {
  const t = await gql(
    token,
    `{ __type(name: "${typeName}") { kind name inputFields { name type { kind name ofType { name kind ofType { name } } } } enumValues { name } } }`,
  );
  console.log('\n===', typeName, '===');
  console.log(JSON.stringify(t.data?.__type, null, 2));
}
