#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function readToken() {
  const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
  const match = yaml.match(/token:\s*(\S+)/);
  return match?.[1];
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
const m = await gql(
  token,
  `{ __type(name: "Mutation") { fields { name args { name type { kind name ofType { name kind ofType { name } } } } } } }`,
);
const names = (m.data?.__type?.fields ?? [])
  .filter((f) => /deploy|redeploy|build|git|trigger|upload|restart|resume/i.test(f.name))
  .map((f) => `${f.name}(${f.args.map((a) => a.name).join(', ')})`);
console.log(names.join('\n'));
