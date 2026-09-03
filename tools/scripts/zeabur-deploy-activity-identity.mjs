#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const repoID = 1323125581;
const branch = process.env.ZEABUR_BRANCH?.trim() ?? 'cursor/p4-1-activity-domain';

const targets = [
  { name: 'activity-service', id: '6a8211c2a21454a2cf6ad77b', dockerfile: 'activity-service' },
  { name: 'identity-service', id: '6a8211cfbdeaa87e2c52df39', dockerfile: 'identity-service' },
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
for (const target of targets) {
  const dep = await gql(
    token,
    `mutation($serviceID: ObjectID!, $specification: DeploymentSpecification!) {
      deployFromSpecification(serviceID: $serviceID, specification: $specification) {
        deploymentID
      }
    }`,
    {
      serviceID: target.id,
      specification: {
        preserveExistingEnv: true,
        source: {
          source: 'GITHUB',
          repoID,
          branch,
          dockerfile: target.dockerfile,
          rootDirectory: '/',
        },
      },
    },
  );
  if (dep.errors?.length) {
    console.log(`${target.name}: FAIL`, dep.errors[0]?.message ?? dep.errors);
  } else {
    console.log(`${target.name}: deployment`, dep.data?.deployFromSpecification?.deploymentID);
  }
}
