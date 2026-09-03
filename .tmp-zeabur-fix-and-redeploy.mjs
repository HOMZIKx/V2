import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const repoID = 1323125581;
const branchName = 'cursor/p4-1-activity-domain';
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

console.log('=== restore git triggers ===');
for (const service of services) {
  process.stdout.write(`${service.name} trigger... `);
  const result = await gql(
    token,
    `mutation UpdateGitTrigger($serviceID: ObjectID!, $environmentID: ObjectID!, $trigger: TriggerInput!) {
      updateGitTrigger(serviceID: $serviceID, environmentID: $environmentID, trigger: $trigger) {
        branchName
        repoID
        provider
      }
    }`,
    {
      serviceID: service.id,
      environmentID,
      trigger: { repoID, branchName },
    },
  );
  if (result.errors?.length) {
    console.log('ERROR', JSON.stringify(result.errors));
  } else {
    console.log('OK', JSON.stringify(result.data?.updateGitTrigger));
  }
}

console.log('\n=== redeploy all ===');
for (const service of services) {
  process.stdout.write(`${service.name} redeploy... `);
  const result = await gql(
    token,
    `mutation Redeploy($serviceID: ObjectID!, $environmentID: ObjectID!) {
      redeployService(serviceID: $serviceID, environmentID: $environmentID)
    }`,
    { serviceID: service.id, environmentID },
  );
  if (result.errors?.length) {
    console.log('ERROR', JSON.stringify(result.errors));
  } else {
    console.log('OK');
  }
}

console.log('\nwaiting 120s...');
await new Promise((resolve) => setTimeout(resolve, 120_000));

console.log('\n=== status via CLI-compatible deployment query ===');
for (const service of services) {
  const result = await gql(
    token,
    `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
      deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 1) {
        edges { node { status commitSHA createdAt } }
      }
    }`,
    { serviceID: service.id, environmentID },
  );
  const node = result.data?.deployments?.edges?.[0]?.node;
  const sha = node?.commitSHA ?? 'unknown';
  const match = sha.startsWith(expectedSha.slice(0, 7)) ? 'MATCH' : 'MISMATCH';
  console.log(
    `${service.name}: status=${node?.status ?? 'unknown'} sha=${sha.slice(0, 12)} ${match}`,
  );
}
