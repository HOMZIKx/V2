import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const serviceID = process.argv[2] ?? '6a9885bb573ada8b3bbe5f1f';
const deploymentID = process.argv[3] ?? '6a9885ea7322e028318346a1';
const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
const token = yaml.match(/token:\s*(\S+)/)?.[1];

async function gql(query, variables = {}) {
  const response = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

const status = await gql(
  `
  query ($serviceID: ObjectID!, $environmentID: ObjectID!, $deploymentID: ObjectID!) {
    deployment(serviceID: $serviceID, environmentID: $environmentID, deploymentID: $deploymentID) {
      status
      createdAt
    }
  }
`,
  { serviceID, environmentID, deploymentID },
);
console.log(JSON.stringify(status, null, 2));
