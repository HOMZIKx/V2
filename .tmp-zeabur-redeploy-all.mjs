import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const expectedSha = '8babc89784820c6fab9b627ce8425049abf52819';

const services = [
  { name: 'authorization-service', id: '6a8211d5a21454a2cf6ad783' },
  { name: 'identity-service', id: '6a8211cfbdeaa87e2c52df39' },
  { name: 'activity-service', id: '6a8211c2a21454a2cf6ad77b' },
  { name: 'discord-gateway', id: '6a8211a6bdeaa87e2c52df28' },
  { name: 'api-gateway', id: '6a8211c9bdeaa87e2c52df34' },
  { name: 'web', id: '6a8211dba21454a2cf6ad789' },
  { name: 'admin', id: '6a8211e2a21454a2cf6ad78e' },
];

function readToken() {
  const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
  const match = yaml.match(/token:\s*(\S+)/);
  if (match === null) {
    throw new Error('zeabur token not found in cli.yaml');
  }
  return match[1];
}

async function gql(token, query, variables) {
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

async function redeploy(token, serviceID) {
  return gql(
    token,
    `mutation Redeploy($serviceID: ObjectID!, $environmentID: ObjectID!) {
      redeployService(serviceID: $serviceID, environmentID: $environmentID)
    }`,
    { serviceID, environmentID },
  );
}

async function latestDeployment(token, serviceID) {
  return gql(
    token,
    `query Deployments($serviceID: ObjectID!, $environmentID: ObjectID!) {
      deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 1) {
        items {
          status
          commitSHA
          createdAt
        }
      }
    }`,
    { serviceID, environmentID },
  );
}

const token = readToken();

for (const service of services) {
  process.stdout.write(`redeploy ${service.name}... `);
  const result = await redeploy(token, service.id);
  if (result.errors?.length) {
    console.log('ERROR', JSON.stringify(result.errors));
  } else {
    console.log('OK', result.data?.redeployService ?? true);
  }
}

console.log('\nwaiting 90s for builds...');
await new Promise((resolve) => setTimeout(resolve, 90_000));

console.log('\n=== deployment status ===');
for (const service of services) {
  const result = await latestDeployment(token, service.id);
  const item = result.data?.deployments?.items?.[0];
  const sha = item?.commitSHA ?? 'unknown';
  const match = sha.startsWith(expectedSha.slice(0, 7)) ? 'MATCH' : 'MISMATCH';
  console.log(`${service.name}: status=${item?.status ?? 'unknown'} sha=${sha.slice(0, 12)} ${match}`);
}
