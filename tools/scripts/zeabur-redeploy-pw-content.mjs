import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const environmentID = '6a720a3e5f062718bc7b3421';
const serviceID = '6a9885bb573ada8b3bbe5f1f';
const repoID = 1323125581;
const branch = 'cursor/player-workspace-team-character-board-foundation';
const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
const token = yaml.match(/token:\s*(\S+)/)?.[1];
const content = fs.readFileSync(path.join(ROOT, 'Dockerfile.player-workspace-service'), 'utf8');

async function gql(query, variables = {}) {
  const response = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

await gql(
  `mutation($serviceID: ObjectID!, $dockerfile: String!) {
    updateDockerfile(serviceID: $serviceID, dockerfile: $dockerfile)
  }`,
  { serviceID, dockerfile: content },
);

await gql(
  `mutation($serviceID: ObjectID!, $gitURL: String!, $branch: String!) {
    bindServiceGitRepo(serviceID: $serviceID, gitURL: $gitURL, branch: $branch)
  }`,
  { serviceID, gitURL: 'https://github.com/HOMZIKx/V2', branch },
);

const dep = await gql(
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
        // empty dockerfile forces use of service-stored Dockerfile content
        dockerfile: '',
        rootDirectory: '/',
      },
    },
  },
);

console.log(JSON.stringify(dep, null, 2));
