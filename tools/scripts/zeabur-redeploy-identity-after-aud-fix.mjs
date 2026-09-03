#!/usr/bin/env node
/** Force identity back to RUNNING after ownership AUD fix. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const environmentID = '6a720a3e5f062718bc7b3421';
const identityServiceID = '6a8211cfbdeaa87e2c52df39';
const repoID = 1323125581;
const branch = 'cursor/player-workspace-team-character-board-foundation';

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
const dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile.identity-service'), 'utf8');
await gql(
  token,
  `mutation($serviceID: ObjectID!, $dockerfile: String!) {
    updateDockerfile(serviceID: $serviceID, dockerfile: $dockerfile)
  }`,
  { serviceID: identityServiceID, dockerfile },
);

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
console.log('deploy', JSON.stringify(dep.data ?? dep.errors));

const deadline = Date.now() + 10 * 60_000;
while (Date.now() < deadline) {
  const st = await gql(
    token,
    `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
      service(_id: $serviceID) { status(environmentID: $environmentID) }
      deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 1) {
        edges { node { _id status commitSHA } }
      }
    }`,
    { serviceID: identityServiceID, environmentID },
  );
  const status = st.data?.service?.status;
  const node = st.data?.deployments?.edges?.[0]?.node;
  console.log(
    `identity ${status} deploy=${node?.status} sha=${(node?.commitSHA ?? '').slice(0, 12)}`,
  );
  if (status === 'RUNNING' && node?.status === 'RUNNING') {
    // confirm listen in logs briefly
    const logs = await gql(
      token,
      `query($projectID: ObjectID!, $serviceID: ObjectID!, $environmentID: ObjectID!, $deploymentID: ObjectID!) {
        runtimeLogs(
          projectID: $projectID
          serviceID: $serviceID
          environmentID: $environmentID
          deploymentID: $deploymentID
        ) { message }
      }`,
      {
        projectID: '6a720a3e472e2c91a9e660d5',
        serviceID: identityServiceID,
        environmentID,
        deploymentID: node._id,
      },
    );
    for (const e of (logs.data?.runtimeLogs ?? []).slice(0, 15)) {
      const m = String(e.message)
        .replace(/\u001b\[[0-9;]*m/g, '')
        .replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, 'postgresql://[REDACTED]@');
      if (/listen|IdentityConfigError|error|Exception|started|OWNERSHIP/i.test(m)) {
        console.log(m.slice(0, 220));
      }
    }
    break;
  }
  if (node?.status === 'FAILED' || status === 'CRASHED') {
    // keep polling a bit in case of race, but surface
  }
  await new Promise((r) => setTimeout(r, 20_000));
}
