#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const serviceID = '6a8211a6bdeaa87e2c52df28';
const branchName = 'cursor/p4-1-activity-domain';

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

for (const typeName of ['GitRefInput', 'CICDBuildSourceInput']) {
  const t = await gql(
    token,
    `{ __type(name: "${typeName}") { inputFields { name type { kind name ofType { name } } } } }`,
  );
  console.log(typeName, JSON.stringify(t.data?.__type, null, 2));
}

const attempts = [
  [
    'bindServiceGitRepo minimal',
    `mutation($serviceID: ObjectID!, $gitURL: String!, $branch: String!) {
      bindServiceGitRepo(serviceID: $serviceID, gitURL: $gitURL, branch: $branch)
    }`,
    { serviceID, gitURL: 'https://github.com/HOMZIKx/V2.git', branch: branchName },
  ],
  [
    'deploy gitRef branch',
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!, $gitRef: GitRefInput) {
      deploy(serviceID: $serviceID, environmentID: $environmentID, gitRef: $gitRef)
    }`,
    { serviceID, environmentID, gitRef: { branch: branchName } },
  ],
  [
    'deployFromSpecification GITHUB',
    `mutation($serviceID: ObjectID!, $specification: DeploymentSpecification!) {
      deployFromSpecification(serviceID: $serviceID, specification: $specification) { deploymentID }
    }`,
    {
      serviceID,
      specification: {
        preserveExistingEnv: true,
        source: {
          source: 'GITHUB',
          repoID: 1323125581,
          branch: branchName,
          dockerfile: 'Dockerfile.discord-gateway',
        },
      },
    },
  ],
];

for (const [label, query, variables] of attempts) {
  const result = await gql(token, query, variables);
  console.log(`\n${label}:`, JSON.stringify(result.errors ?? result.data, null, 2));
}
