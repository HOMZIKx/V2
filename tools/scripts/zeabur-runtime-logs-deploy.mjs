#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectID = '6a720a3e472e2c91a9e660d5';
const environmentID = '6a720a3e5f062718bc7b3421';
const serviceID = process.argv[2] ?? '6a8211a6bdeaa87e2c52df28';
const deploymentID = process.argv[3] ?? '6a8f1941926d1a08b2ffa500';

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
const res = await gql(
  token,
  `query($projectID: ObjectID!, $serviceID: ObjectID!, $environmentID: ObjectID!, $deploymentID: ObjectID!) {
    runtimeLogs(
      projectID: $projectID
      serviceID: $serviceID
      environmentID: $environmentID
      deploymentID: $deploymentID
    ) {
      message
      timestamp
    }
  }`,
  { projectID, serviceID, environmentID, deploymentID },
);
if (res.errors?.length) {
  console.error(JSON.stringify(res.errors, null, 2));
  process.exitCode = 1;
} else {
  const lines = res.data?.runtimeLogs ?? [];
  for (const e of lines.slice(-100)) {
    console.log(
      String(e.message)
        .replace(/\u001b\[[0-9;]*m/g, '')
        .slice(0, 400),
    );
  }
  console.log(`\ntotal=${lines.length}`);
}
