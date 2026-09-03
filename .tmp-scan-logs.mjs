import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const projectID = '6a720a3e472e2c91a9e660d5';
const environmentID = '6a720a3e5f062718bc7b3421';
const pairs = [
  ['activity', '6a8211c2a21454a2cf6ad77b', '6a95e7dcbe05255ec5e276de'],
  ['identity', '6a8211cfbdeaa87e2c52df39', '6a95e2b99ed7d65609e28237'],
];
const token = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8').match(/token:\s*(\S+)/)[1];
async function gql(query, variables) {
  const r = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}
for (const [name, serviceID, deploymentID] of pairs) {
  const res = await gql(
    `query($projectID: ObjectID!, $serviceID: ObjectID!, $environmentID: ObjectID!, $deploymentID: ObjectID!) {
      runtimeLogs(projectID: $projectID, serviceID: $serviceID, environmentID: $environmentID, deploymentID: $deploymentID) {
        message timestamp
      }
    }`,
    { projectID, serviceID, environmentID, deploymentID },
  );
  const lines = (res.data?.runtimeLogs ?? []).map((e) => String(e.message).replace(/\u001b\[[0-9;]*m/g, ''));
  const err = lines.filter((m) => /error|fatal|exception|unhealthy|ECONNREFUSED|JWT|invalid/i.test(m));
  console.log(`\n=== ${name} total=${lines.length} errLines=${err.length} ===`);
  for (const m of err.slice(-25)) console.log(m.slice(0, 350));
}
