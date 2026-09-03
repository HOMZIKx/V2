#!/usr/bin/env node
/** Redeploy subset with zbpack Dockerfile suffix (Dockerfile.<name>). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const repoID = 1323125581;
const branch = 'cursor/p4-1-activity-domain';

const services = [
  { name: 'authorization-service', id: '6a8211d5a21454a2cf6ad783', dockerfile: 'authorization-service' },
  { name: 'identity-service', id: '6a8211cfbdeaa87e2c52df39', dockerfile: 'identity-service' },
  { name: 'activity-service', id: '6a8211c2a21454a2cf6ad77b', dockerfile: 'activity-service' },
  { name: 'web', id: '6a8211dba21454a2cf6ad789', dockerfile: 'web' },
  { name: 'admin', id: '6a8211e2a21454a2cf6ad78e', dockerfile: 'admin' },
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
          dockerfile: service.dockerfile,
          rootDirectory: '/',
        },
      },
    },
  );
  if (dep.errors?.length) {
    console.log(`${service.name}: FAIL`, dep.errors[0]?.message);
  } else {
    console.log(`${service.name}: deployment`, dep.data?.deployFromSpecification?.deploymentID);
  }
}
