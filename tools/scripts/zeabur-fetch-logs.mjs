#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const serviceID = process.argv[2] ?? '6a8211a6bdeaa87e2c52df28';
const query = process.argv[3] ?? 'reconcile';

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
const runtime = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    runtimeLogs(serviceID: $serviceID, environmentID: $environmentID) {
      message
      timestamp
    }
  }`,
  { serviceID, environmentID },
);
if (runtime.errors?.length) {
  console.error(JSON.stringify(runtime.errors, null, 2));
  process.exitCode = 1;
} else {
  const lines = runtime.data?.runtimeLogs ?? [];
  const needle = query.toLowerCase();
  const matched = lines.filter((e) => String(e.message).toLowerCase().includes(needle));
  const show = matched.length ? matched.slice(-40) : lines.slice(-40);
  for (const e of show) {
    console.log(`${e.timestamp ?? ''} ${String(e.message).replace(/\u001b\[[0-9;]*m/g, '')}`);
  }
  console.log(`\n(total=${lines.length} matched=${matched.length} query=${query})`);
}
