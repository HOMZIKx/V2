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
const m = await gql(
  token,
  `{ __type(name: "Mutation") { fields { name args { name type { kind name ofType { name kind ofType { name } } } } } } }`,
);
const updateFields = (m.data?.__type?.fields ?? []).filter((f) =>
  /updateService|deployFrom|redeploy|bindService/i.test(f.name),
);
for (const f of updateFields) {
  console.log(
    `${f.name}(${f.args.map((a) => `${a.name}: ${a.type.name ?? a.type.ofType?.name}`).join(', ')})`,
  );
}
