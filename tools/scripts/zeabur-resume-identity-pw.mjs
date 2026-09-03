#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { fileURLToPath } from 'node:url';

const environmentID = '6a720a3e5f062718bc7b3421';
const identityServiceID = '6a8211cfbdeaa87e2c52df39';
const repoID = 1323125581;
const branch = 'cursor/player-workspace-team-character-board-foundation';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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
const mut = await gql(token, `{ __type(name: "Mutation") { fields { name } } }`);
console.log(
  (mut.data?.__type?.fields ?? [])
    .map((f) => f.name)
    .filter((n) => /resume|suspend|deploy|restart|start|stop|cicd/i.test(n))
    .join('\n'),
);

const dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile.identity-service'), 'utf8');
await gql(
  token,
  `mutation($serviceID: ObjectID!, $dockerfile: String!) {
    updateDockerfile(serviceID: $serviceID, dockerfile: $dockerfile)
  }`,
  { serviceID: identityServiceID, dockerfile },
);

const redeploy = await gql(
  token,
  `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) {
    redeployService(serviceID: $serviceID, environmentID: $environmentID)
  }`,
  { serviceID: identityServiceID, environmentID },
);
console.log('redeployService', JSON.stringify(redeploy.data ?? redeploy.errors));

const dep = await gql(
  token,
  `mutation($serviceID: ObjectID!, $specification: DeploymentSpecification!) {
    deployFromSpecification(serviceID: $serviceID, specification: $specification) {
      deploymentID
    }
  }`,
  {
    serviceID: identityServiceID,
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
console.log('deployFromSpecification', JSON.stringify(dep.data ?? dep.errors));

const deadline = Date.now() + 10 * 60_000;
while (Date.now() < deadline) {
  const st = await gql(
    token,
    `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
      service(_id: $serviceID) { status(environmentID: $environmentID) }
      deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 1) {
        edges { node { status commitSHA createdAt } }
      }
    }`,
    { serviceID: identityServiceID, environmentID },
  );
  const status = st.data?.service?.status;
  const node = st.data?.deployments?.edges?.[0]?.node;
  console.log(
    `identity ${status} deploy=${node?.status} sha=${(node?.commitSHA ?? '').slice(0, 12)}`,
  );
  if (status === 'RUNNING' && node?.status === 'RUNNING') break;
  if (
    ['FAILED', 'REMOVED', 'CRASHED'].includes(node?.status) &&
    Date.now() > deadline - 8 * 60_000
  ) {
    // keep waiting a bit after new deploy
  }
  await new Promise((r) => setTimeout(r, 20_000));
}
