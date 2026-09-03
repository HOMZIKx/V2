import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const environmentID = '6a720a3e5f062718bc7b3421';
const serviceID = '6a8211c9bdeaa87e2cf6ad34';
const token = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8').match(/token:\s*(\S+)/)[1];
const query = `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
  deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 5) {
    edges { node { _id status createdAt commitSHA } }
  }
  service(_id: $serviceID) { name status }
}`;
const r = await fetch('https://api.zeabur.com/graphql', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ query, variables: { serviceID, environmentID } }),
}).then((x) => x.json());
console.log(JSON.stringify(r, null, 2));
