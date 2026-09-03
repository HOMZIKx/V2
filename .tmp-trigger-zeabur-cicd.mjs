import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
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

const token = readToken();
for (const svc of services) {
  for (const [label, query] of [
    [
      'triggerCICDSource',
      `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) {
        triggerCICDSource(serviceID: $serviceID, environmentID: $environmentID)
      }`,
    ],
    [
      'redeployService',
      `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) {
        redeployService(serviceID: $serviceID, environmentID: $environmentID)
      }`,
    ],
  ]) {
    process.stdout.write(`${svc.name} ${label}... `);
    const result = await gql(token, query, {
      serviceID: svc.id,
      environmentID,
    });
    if (result.errors?.length) {
      console.log('FAIL', result.errors[0]?.message ?? JSON.stringify(result.errors));
    } else {
      console.log('OK');
    }
  }
}
