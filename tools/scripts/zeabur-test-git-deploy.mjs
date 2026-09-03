#!/usr/bin/env node
/** Test Git deployFromSpecification with zbpack suffix dockerfile. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const serviceID = '6a8211a6bdeaa87e2c52df28';
const repoID = 1323125581;
const branch = 'cursor/p4-1-activity-domain';

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

// reset dockerfile to suffix for git/zbpack
const upd = await gql(
  token,
  `mutation($serviceID: ObjectID!, $dockerfile: String!) {
    updateDockerfile(serviceID: $serviceID, dockerfile: $dockerfile)
  }`,
  { serviceID, dockerfile: 'discord-gateway' },
);
console.log('updateDockerfile:', upd.errors?.[0]?.message ?? 'OK');

const trig = await gql(
  token,
  `mutation($serviceID: ObjectID!, $environmentID: ObjectID!, $trigger: TriggerInput!) {
    updateGitTrigger(serviceID: $serviceID, environmentID: $environmentID, trigger: $trigger)
  }`,
  { serviceID, environmentID, trigger: { repoID, branchName: branch } },
);
console.log('updateGitTrigger:', trig.errors?.[0]?.message ?? trig.data);

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
      source: {
        source: 'GITHUB',
        repoID,
        branch,
        dockerfile: 'discord-gateway',
        rootDirectory: '/',
      },
    },
  },
);
console.log('deployFromSpecification:', JSON.stringify(dep, null, 2));
