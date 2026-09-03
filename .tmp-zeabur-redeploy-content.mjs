#!/usr/bin/env node
/** Sync Dockerfile FILE CONTENT into deployFromSpecification (Zeabur treats dockerfile as content). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.');
const environmentID = '6a720a3e5f062718bc7b3421';
const repoID = 1323125581;
const branch = 'cursor/p4-1-activity-domain';

const services = [
  {
    name: 'authorization-service',
    id: '6a8211d5a21454a2cf6ad783',
    file: 'Dockerfile.authorization-service',
  },
  { name: 'identity-service', id: '6a8211cfbdeaa87e2c52df39', file: 'Dockerfile.identity-service' },
  { name: 'activity-service', id: '6a8211c2a21454a2cf6ad77b', file: 'Dockerfile.activity-service' },
  { name: 'web', id: '6a8211dba21454a2cf6ad789', file: 'Dockerfile.web' },
  { name: 'admin', id: '6a8211e2a21454a2cf6ad78e', file: 'Dockerfile.admin' },
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
  const content = fs.readFileSync(path.join(ROOT, service.file), 'utf8');
  const sync = await gql(
    token,
    `mutation($serviceID: ObjectID!, $dockerfile: String!) {
      updateDockerfile(serviceID: $serviceID, dockerfile: $dockerfile)
    }`,
    { serviceID: service.id, dockerfile: content },
  );
  if (sync.errors?.length) {
    console.log(`${service.name}: sync FAIL`, sync.errors[0]?.message);
    continue;
  }

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
          dockerfile: content,
          rootDirectory: '/',
        },
      },
    },
  );
  if (dep.errors?.length) {
    console.log(`${service.name}: deploy FAIL`, dep.errors[0]?.message);
  } else {
    console.log(
      `${service.name}: deployment`,
      dep.data?.deployFromSpecification?.deploymentID,
      `(dockerfile ${content.length} bytes)`,
    );
  }
}
