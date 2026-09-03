#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const identityServiceID = '6a8211cfbdeaa87e2c52df39';

function readToken() {
  const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
  return yaml.match(/token:\s*(\S+)/)?.[1];
}

const token = readToken();
const response = await fetch('https://api.zeabur.com/graphql', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({
    query:
      'mutation($serviceID: ObjectID!, $environmentID: ObjectID!) { triggerCICDSource(serviceID: $serviceID, environmentID: $environmentID) }',
    variables: { serviceID: identityServiceID, environmentID },
  }),
});
console.log(JSON.stringify(await response.json()));
