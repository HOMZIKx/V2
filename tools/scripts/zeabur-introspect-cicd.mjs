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
for (const name of ['CreateCICDSourceInput', 'TriggerInput', 'ServiceSpecGitSource']) {
  const t = await gql(
    token,
    `{ __type(name: "${name}") { kind inputFields { name type { kind name ofType { name } } } enumValues { name } } }`,
  );
  console.log(`\n${name}:`, JSON.stringify(t.data?.__type, null, 2).slice(0, 2000));
}

const m = await gql(
  token,
  `{ __type(name: "Mutation") { fields { name args { name type { name ofType { name } } } } } }`,
);
for (const f of (m.data?.__type?.fields ?? []).filter((x) => /CICD|Git|Trigger/i.test(x.name))) {
  console.log(f.name, f.args.map((a) => a.name).join(', '));
}
