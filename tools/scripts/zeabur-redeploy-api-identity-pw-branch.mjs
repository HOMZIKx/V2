#!/usr/bin/env node
/** Redeploy api-gateway + identity-service from PW foundation branch. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const environmentID = '6a720a3e5f062718bc7b3421';
const repoID = 1323125581;
const branch = 'cursor/player-workspace-team-character-board-foundation';
const gitURL = 'https://github.com/HOMZIKx/V2';

const services = [
  {
    name: 'api-gateway',
    id: '6a8211c9bdeaa87e2c52df34',
    dockerfilePath: 'Dockerfile.api-gateway',
  },
  {
    name: 'identity-service',
    id: '6a8211cfbdeaa87e2c52df39',
    dockerfilePath: 'Dockerfile.identity-service',
  },
];

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

for (const service of services) {
  console.log(`\n=== ${service.name} ===`);
  const content = fs.readFileSync(path.join(ROOT, service.dockerfilePath), 'utf8');
  const upd = await gql(
    token,
    `mutation($serviceID: ObjectID!, $dockerfile: String!) {
      updateDockerfile(serviceID: $serviceID, dockerfile: $dockerfile)
    }`,
    { serviceID: service.id, dockerfile: content },
  );
  console.log('updateDockerfile:', upd.errors?.[0]?.message ?? 'OK');

  const bind = await gql(
    token,
    `mutation($serviceID: ObjectID!, $gitURL: String!, $branch: String!) {
      bindServiceGitRepo(serviceID: $serviceID, gitURL: $gitURL, branch: $branch)
    }`,
    { serviceID: service.id, gitURL, branch },
  );
  console.log('bind:', bind.errors?.[0]?.message ?? 'OK');

  const dep = await gql(
    token,
    `mutation($serviceID: ObjectID!, $specification: DeploymentSpecification!) {
      deployFromSpecification(serviceID: $serviceID, specification: $specification) {
        deploymentID
      }
    }`,
    {
      serviceID: service.id,
      specification: {
        preserveExistingEnv: true,
        source: {
          source: 'GITHUB',
          repoID,
          branch,
          dockerfile: '',
          rootDirectory: '/',
        },
      },
    },
  );
  if (dep.errors?.length) {
    console.log('deploy FAIL', dep.errors[0]?.message);
  } else {
    console.log('deploy queued', dep.data?.deployFromSpecification?.deploymentID);
  }
}

console.log('\nPolling deployments…');
const deadline = Date.now() + 12 * 60_000;
while (Date.now() < deadline) {
  let allDone = true;
  for (const service of services) {
    const result = await gql(
      token,
      `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
        deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 1) {
          edges { node { _id status commitSHA createdAt } }
        }
      }`,
      { serviceID: service.id, environmentID },
    );
    const node = result.data?.deployments?.edges?.[0]?.node;
    console.log(
      `${service.name}: ${node?.status} sha=${(node?.commitSHA ?? '').slice(0, 12)} at=${node?.createdAt}`,
    );
    if (!node || ['BUILDING', 'PENDING', 'STARTING'].includes(node.status)) {
      allDone = false;
    }
  }
  if (allDone) break;
  await new Promise((r) => setTimeout(r, 20_000));
}

const live = await fetch('https://v2-api.zeabur.app/health/live');
const liveBody = await live.text();
console.log('\nAPI live:', live.status, liveBody.slice(0, 200));

for (const pathSuffix of ['/player-workspace/v1/teams', '/health/live']) {
  const url = `https://v2-api.zeabur.app${pathSuffix}`;
  const res = await fetch(url);
  const text = await res.text();
  console.log(`${pathSuffix}: ${res.status} ${text.slice(0, 160)}`);
}
