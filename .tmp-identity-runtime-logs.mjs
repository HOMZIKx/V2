#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const token = fs
  .readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8')
  .match(/token:\s*(\S+)/)?.[1];

async function gql(query, variables = {}) {
  const response = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

const logs = await gql(
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    runtimeLogs(serviceID: $serviceID, environmentID: $environmentID) {
      message timestamp
    }
  }`,
  { serviceID: '6a8211cfbdeaa87e2c52df39', environmentID: '6a720a3e5f062718bc7b3421' },
);
const lines = logs.data?.runtimeLogs ?? [];
for (const entry of lines.slice(-40)) {
  const msg = String(entry.message ?? '').replace(/\u001b\[[0-9;]*m/g, '');
  if (/migrat|skipped|applied|Startup|listen|ready|error|fail/i.test(msg)) {
    console.log(msg.slice(0, 300));
  }
}
console.log('total', lines.length);
