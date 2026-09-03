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
for (const q of [
  `{ __type(name: "Region") { enumValues { name } } }`,
  `{ serverlessRegions { id name code } }`,
  `{ regions { id name code } }`,
  `{ buildRegions { id name code } }`,
]) {
  const r = await gql(token, q);
  if (r.data && !r.errors) console.log(q, JSON.stringify(r.data));
  else if (r.errors) console.log(q, 'ERR', r.errors[0]?.message);
}
