import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const repoID = 1323125581;
const branchName = 'cursor/p4-1-activity-domain';
const gitURL = 'https://github.com/HOMZIKx/V2';
const serviceID = '6a8211c2a21454a2cf6ad77b';

function readToken() {
  const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
  const match = yaml.match(/token:\s*(\S+)/);
  if (match === null) throw new Error('no token');
  return match[1];
}

async function gql(token, query, variables = {}) {
  const response = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

const token = readToken();

for (const [label, query, variables] of [
  [
    'bindServiceGitRepo',
    `mutation($serviceID: ObjectID!, $gitURL: String!, $branch: String!) {
      bindServiceGitRepo(serviceID: $serviceID, gitURL: $gitURL, branch: $branch)
    }`,
    { serviceID, gitURL, branch: branchName },
  ],
  [
    'updateGitTrigger',
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!, $trigger: TriggerInput!) {
      updateGitTrigger(serviceID: $serviceID, environmentID: $environmentID, trigger: $trigger)
    }`,
    { serviceID, environmentID, trigger: { repoID, branchName } },
  ],
  [
    'deployFromSpecification',
    `mutation($serviceID: ObjectID!, $specification: DeploymentSpecification!) {
      deployFromSpecification(serviceID: $serviceID, specification: $specification)
    }`,
    {
      serviceID,
      specification: {
        preserveExistingEnv: true,
        source: {
          type: 'GIT',
          gitRepoID: repoID,
          branch: branchName,
        },
      },
    },
  ],
]) {
  const result = await gql(token, query, variables);
  console.log(`\n${label}:`, JSON.stringify(result, null, 2));
}

const git = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    service(_id: $serviceID) {
      gitTrigger(environmentID: $environmentID) { branchName repoID provider repoURL }
    }
  }`,
  { serviceID, environmentID },
);
console.log('\ngitTrigger:', JSON.stringify(git.data ?? git.errors, null, 2));

const deps = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 2) {
      edges { node { status commitSHA createdAt } }
    }
  }`,
  { serviceID, environmentID },
);
console.log('\nrecent deployments:', JSON.stringify(deps.data ?? deps.errors, null, 2));
