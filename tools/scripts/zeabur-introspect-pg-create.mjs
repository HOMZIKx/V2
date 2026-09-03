#!/usr/bin/env node
/** Introspect createPostgresDatabase / executeDatabaseCommand args. */
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
const mut = await gql(
  token,
  `{ __type(name: "Mutation") { fields { name args { name type { kind name ofType { kind name ofType { name } } } } } } }`,
);
for (const f of mut.data?.__type?.fields ?? []) {
  if (/postgres|DatabaseCommand|executeDatabase/i.test(f.name)) {
    console.log(
      f.name,
      (f.args ?? [])
        .map((a) => {
          const t = a.type;
          const name = t.name || t.ofType?.name || t.ofType?.ofType?.name;
          return `${a.name}:${t.kind}${name ? `(${name})` : ''}`;
        })
        .join(', '),
    );
  }
}
