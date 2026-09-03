import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const repoID = 1323125581;
const branchName = 'cursor/p4-1-activity-domain';
const expectedSha = 'd596a9f6a25e89e4afb0f844f7a4f15922db5590';
const services = [
  { name: 'activity-service', id: '6a8211c2a21454a2cf6ad77b' },
  { name: 'discord-gateway', id: '6a8211a6bdeaa87e2c52df28' },
];

function readToken() {
  const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
  const match = yaml.match(/token:\s*(\S+)/);
  if (match === null) throw new Error('no zeabur token');
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

async function latest(token, serviceID) {
  const result = await gql(
    token,
    `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
      deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 1) {
        edges { node { status commitSHA createdAt } }
      }
    }`,
    { serviceID, environmentID },
  );
  return result.data?.deployments?.edges?.[0]?.node ?? null;
}

const token = readToken();
console.log(`Expected tip: ${expectedSha.slice(0, 7)}\n`);

for (const svc of services) {
  process.stdout.write(`git trigger ${svc.name}... `);
  const trigger = await gql(
    token,
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!, $trigger: TriggerInput!) {
      updateGitTrigger(serviceID: $serviceID, environmentID: $environmentID, trigger: $trigger) {
        branchName
        repoID
      }
    }`,
    {
      serviceID: svc.id,
      environmentID,
      trigger: { repoID, branchName },
    },
  );
  console.log(trigger.errors?.length ? JSON.stringify(trigger.errors) : 'OK');

  process.stdout.write(`redeploy ${svc.name}... `);
  const redeploy = await gql(
    token,
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) {
      redeployService(serviceID: $serviceID, environmentID: $environmentID)
    }`,
    { serviceID: svc.id, environmentID },
  );
  console.log(redeploy.errors?.length ? JSON.stringify(redeploy.errors) : 'OK');
}

console.log('\nPolling up to 12 min...');
const deadline = Date.now() + 12 * 60 * 1000;
while (Date.now() < deadline) {
  let allMatch = true;
  for (const svc of services) {
    const node = await latest(token, svc.id);
    const status = node?.status ?? 'unknown';
    const sha = node?.commitSHA?.slice(0, 7) ?? '?';
    const match = node?.commitSHA?.startsWith(expectedSha.slice(0, 7)) === true;
    console.log(`${svc.name}: ${status} @ ${sha} ${match ? 'MATCH' : 'waiting'}`);
    if (!match || status !== 'RUNNING') {
      allMatch = false;
    }
    if (status === 'FAILED' || status === 'CRASHED') {
      process.exitCode = 1;
      console.error(`${svc.name} failed`);
    }
  }
  if (allMatch) {
    console.log('\nDone — Discord test guild should have tip code.');
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 30_000));
}
