#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const token = fs
  .readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8')
  .match(/token:\s*(\S+)/)?.[1];
const environmentID = '6a720a3e5f062718bc7b3421';

async function gql(query, variables = {}) {
  const response = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

const content = fs.readFileSync('Dockerfile.activity-service', 'utf8');
const activityID = '6a8211c2a21454a2cf6ad77b';
await gql(
  `mutation($serviceID: ObjectID!, $dockerfile: String!) {
    updateDockerfile(serviceID: $serviceID, dockerfile: $dockerfile)
  }`,
  { serviceID: activityID, dockerfile: content },
);
const dep = await gql(
  `mutation($serviceID: ObjectID!, $specification: DeploymentSpecification!) {
    deployFromSpecification(serviceID: $serviceID, specification: $specification) {
      deploymentID
    }
  }`,
  {
    serviceID: activityID,
    specification: {
      preserveExistingEnv: true,
      source: {
        source: 'GITHUB',
        repoID: 1323125581,
        branch: 'cursor/p4-1-activity-domain',
        dockerfile: content,
        rootDirectory: '/',
      },
    },
  },
);
console.log('activity deploy', JSON.stringify(dep.data ?? dep.errors));

const identityID = '6a8211cfbdeaa87e2c52df39';
const restart = await gql(
  `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) {
    restartService(serviceID: $serviceID, environmentID: $environmentID)
  }`,
  { serviceID: identityID, environmentID },
);
console.log('identity restart', JSON.stringify(restart.data ?? restart.errors));
