import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const expectedSha = process.argv[2] ?? 'd596a9f6a25e89e4afb0f844f7a4f15922db5590';
const services = [
  { name: 'activity-service', id: '6a8211c2a21454a2cf6ad77b' },
  { name: 'discord-gateway', id: '6a8211a6bdeaa87e2c52df28' },
  { name: 'api-gateway', id: '6a8211c9bdeaa87e2c52df34' },
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

const token = readToken();
console.log('Expected git tip:', expectedSha.slice(0, 12));
console.log('');

for (const svc of services) {
  const dep = await gql(
    token,
    `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
      deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 3) {
        edges {
          node {
            status
            commitSHA
            commitMessage
            createdAt
            finishedAt
          }
        }
      }
    }`,
    { serviceID: svc.id, environmentID },
  );
  const edges = dep.data?.deployments?.edges ?? [];
  console.log(`=== ${svc.name} ===`);
  if (edges.length === 0) {
    console.log('no deployments');
    continue;
  }
  for (const edge of edges) {
    const n = edge.node;
    const sha = n.commitSHA ?? '?';
    const match = sha.startsWith(expectedSha.slice(0, 7)) ? 'MATCH' : 'STALE';
    console.log(
      `${n.status} @ ${sha.slice(0, 12)} (${match}) ${n.createdAt ?? ''} | ${String(n.commitMessage ?? '').slice(0, 60)}`,
    );
  }
  console.log('');
}
