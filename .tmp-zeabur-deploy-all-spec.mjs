import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
const enumResult = await gql(
  token,
  `{ __type(name: "ServiceSpecGitSource") { enumValues { name } } }`,
);
console.log('enum:', JSON.stringify(enumResult.data?.__type?.enumValues));

const services = [
  { name: 'authorization-service', id: '6a8211d5a21454a2cf6ad783', dockerfile: 'Dockerfile.authorization-service' },
  { name: 'identity-service', id: '6a8211cfbdeaa87e2c52df39', dockerfile: 'Dockerfile.identity-service' },
  { name: 'activity-service', id: '6a8211c2a21454a2cf6ad77b', dockerfile: 'Dockerfile.activity-service' },
  { name: 'discord-gateway', id: '6a8211a6bdeaa87e2c52df28', dockerfile: 'Dockerfile.discord-gateway' },
  { name: 'api-gateway', id: '6a8211c9bdeaa87e2c52df34', dockerfile: 'Dockerfile.api-gateway' },
  { name: 'web', id: '6a8211dba21454a2cf6ad789', dockerfile: 'Dockerfile.web' },
  { name: 'admin', id: '6a8211e2a21454a2cf6ad78e', dockerfile: 'Dockerfile.admin' },
];

for (const service of services) {
  const result = await gql(
    token,
    `mutation Deploy($serviceID: ObjectID!, $specification: DeploymentSpecification!) {
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
          repoID: 1323125581,
          branch: 'cursor/p4-1-activity-domain',
          dockerfile: service.dockerfile,
        },
      },
    },
  );
  console.log(
    service.name,
    result.errors ? JSON.stringify(result.errors) : `deploymentID=${result.data?.deployFromSpecification?.deploymentID}`,
  );
}
