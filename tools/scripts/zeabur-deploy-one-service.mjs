#!/usr/bin/env node
/** Deploy one service from GitHub branch via bind + trigger + deployFromSpecification. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const repoID = 1323125581;
const branch = process.env.ZEABUR_BRANCH?.trim() ?? 'cursor/p4-1-activity-domain';
const serviceName = process.argv[2];
const serviceID = process.argv[3];
const dockerfile = process.argv[4] ?? serviceName;

if (!serviceName || !serviceID) {
  console.error('Usage: node zeabur-deploy-one-service.mjs <name> <serviceID> [dockerfile]');
  process.exit(1);
}

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
await gql(
  token,
  `mutation($serviceID: ObjectID!, $gitURL: String!, $branch: String!) {
    bindServiceGitRepo(serviceID: $serviceID, gitURL: $gitURL, branch: $branch)
  }`,
  { serviceID, gitURL: 'https://github.com/HOMZIKx/V2', branch },
);

await gql(
  token,
  `mutation($serviceID: ObjectID!, $environmentID: ObjectID!, $trigger: TriggerInput!) {
    updateGitTrigger(serviceID: $serviceID, environmentID: $environmentID, trigger: $trigger)
  }`,
  { serviceID, environmentID, trigger: { repoID, branchName: branch } },
);

const dep = await gql(
  token,
  `mutation($serviceID: ObjectID!, $specification: DeploymentSpecification!) {
    deployFromSpecification(serviceID: $serviceID, specification: $specification) {
      deploymentID
    }
  }`,
  {
    serviceID,
    specification: {
      preserveExistingEnv: true,
      source: { source: 'GITHUB', repoID, branch, dockerfile, rootDirectory: '/' },
    },
  },
);

if (dep.errors?.length) {
  console.error(`${serviceName}: FAIL`, dep.errors[0]?.message ?? dep.errors);
  process.exit(1);
}
console.log(`${serviceName}: deployment`, dep.data?.deployFromSpecification?.deploymentID);
