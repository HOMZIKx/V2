import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const deploymentID = process.argv[2] ?? '6a9887017322e028318346c1';
const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
const token = yaml.match(/token:\s*(\S+)/)?.[1];

const response = await fetch('https://api.zeabur.com/graphql', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({
    query: `query($id: ObjectID!) { deployment(_id: $id) { _id status createdAt } }`,
    variables: { id: deploymentID },
  }),
});
console.log(JSON.stringify(await response.json(), null, 2));
