#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const serviceID = process.argv[2] ?? '6a8211a6bdeaa87e2c52df28';
const queryText = process.argv[3] ?? 'Startup hub';

function readToken() {
  const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
  return yaml.match(/token:\s*(\S+)/)?.[1];
}

async function gql(token, q, variables = {}) {
  const response = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: q, variables }),
  });
  return response.json();
}

const token = readToken();
const meta = await gql(
  token,
  `{ __type(name: "Query") { fields { name args { name type { name kind ofType { name kind ofType { name } } } } } } }`,
);
const fields = meta.data?.__type?.fields ?? [];
for (const name of ['runtimeLogs', 'searchRuntimeLogs', 'buildLogs']) {
  const f = fields.find((x) => x.name === name);
  console.log(name, f ? f.args.map((a) => a.name).join(',') : 'MISSING');
}

const search = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!, $query: String!) {
    searchRuntimeLogs(serviceID: $serviceID, environmentID: $environmentID, query: $query, limit: 40) {
      message
      timestamp
    }
  }`,
  { serviceID, environmentID, query: queryText },
);
if (search.errors?.length) {
  console.error('search errors', JSON.stringify(search.errors, null, 2));
} else {
  const lines = search.data?.searchRuntimeLogs ?? [];
  for (const e of lines) {
    console.log(
      `${e.timestamp ?? ''} ${String(e.message)
        .replace(/\u001b\[[0-9;]*m/g, '')
        .slice(0, 400)}`,
    );
  }
  console.log(`\nmatched=${lines.length}`);
}
