#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const registry = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'tools/runtime/service-registry.json'), 'utf8'),
);
const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
const token = yaml.match(/token:\s*(\S+)/)?.[1];
if (!token) throw new Error('no token');

async function probe(name, serviceID) {
  const entry = registry.services.find((s) => s.name === name);
  const content = fs.readFileSync(path.join(ROOT, entry.dockerfile), 'utf8');
  const res = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      query: `mutation($serviceID: ObjectID!, $dockerfile: String!) {
        updateDockerfile(serviceID: $serviceID, dockerfile: $dockerfile)
      }`,
      variables: { serviceID, dockerfile: content },
    }),
  });
  const json = await res.json();
  console.log(`\n${name}: bytes=${content.length}`);
  console.log(JSON.stringify(json, null, 2));
}

for (const [name, id] of [
  ['identity-service', '6a8211cfbdeaa87e2c52df39'],
  ['admin', '6a8211e2a21454a2cf6ad78e'],
  ['web', '6a8211dba21454a2cf6ad789'],
]) {
  await probe(name, id);
}
