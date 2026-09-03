#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const serviceID = '6a8211a6bdeaa87e2c52df28';
const environmentID = '6a720a3e5f062718bc7b3421';

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
const bind = await gql(
  token,
  `mutation($serviceID: ObjectID!, $gitURL: String!, $branch: String!) {
    bindServiceGitRepo(serviceID: $serviceID, gitURL: $gitURL, branch: $branch)
  }`,
  { serviceID, gitURL: 'https://github.com/HOMZIKx/V2', branch: 'cursor/p4-1-activity-domain' },
);
console.log('bind:', JSON.stringify(bind, null, 2));

const svc = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    service(_id: $serviceID) {
      spec { source { dockerfile rootDirectory } }
      gitTrigger(environmentID: $environmentID) { branchName repoID provider repoURL }
    }
  }`,
  { serviceID, environmentID },
);
console.log('service:', JSON.stringify(svc.data, null, 2));
