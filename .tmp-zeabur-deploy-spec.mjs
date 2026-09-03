import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const repoID = 1323125581;
const branchName = 'cursor/p4-1-activity-domain';
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

for (const typeName of ['DeploymentResult', 'ServiceSpecSourceInput', 'TriggerCICDSourceInput']) {
  const result = await gql(
    token,
    `query($name: String!) { __type(name: $name) { inputFields { name type { kind name ofType { name kind ofType { name } } } } fields { name type { kind name ofType { name } } } } }`,
    { name: typeName },
  );
  console.log(`\n=== ${typeName} ===`, JSON.stringify(result.data?.__type ?? result.errors, null, 2));
}

const deploy = await gql(
  token,
  `mutation($serviceID: ObjectID!, $specification: DeploymentSpecification!) {
    deployFromSpecification(serviceID: $serviceID, specification: $specification) {
      deploymentID
      message
    }
  }`,
  {
    serviceID,
    specification: {
      preserveExistingEnv: true,
      source: {
        gitRepoID: repoID,
        branch: branchName,
      },
    },
  },
);
console.log('\ndeployFromSpecification:', JSON.stringify(deploy, null, 2));
