#!/usr/bin/env node
/** Redeploy one or all services via redeployService + triggerCICDSource. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const repoID = 1323125581;
const branchName = 'cursor/p4-1-activity-domain';

const services = [
  { name: 'authorization-service', id: '6a8211d5a21454a2cf6ad783' },
  { name: 'identity-service', id: '6a8211cfbdeaa87e2c52df39' },
  { name: 'activity-service', id: '6a8211c2a21454a2cf6ad77b' },
  { name: 'discord-gateway', id: '6a8211a6bdeaa87e2c52df28' },
  { name: 'api-gateway', id: '6a8211c9bdeaa87e2c52df34' },
  { name: 'web', id: '6a8211dba21454a2cf6ad789' },
  { name: 'admin', id: '6a8211e2a21454a2cf6ad78e' },
];

const only = process.argv.slice(2);

function readToken() {
  const fromEnv = process.env.ZEABUR_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
  const match = yaml.match(/token:\s*(\S+)/);
  if (!match) throw new Error('No zeabur token');
  return match[1];
}

async function gql(token, query, variables = {}) {
  const response = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

const token = readToken();
const targets = only.length > 0 ? services.filter((s) => only.includes(s.name)) : services;

for (const service of targets) {
  process.stdout.write(`${service.name}: trigger `);
  const trig = await gql(
    token,
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!, $trigger: TriggerInput!) {
      updateGitTrigger(serviceID: $serviceID, environmentID: $environmentID, trigger: $trigger)
    }`,
    { serviceID: service.id, environmentID, trigger: { repoID, branchName } },
  );
  if (trig.errors?.length) process.stdout.write(`triggerErr(${trig.errors[0]?.message}) `);

  const cicd = await gql(
    token,
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) {
      triggerCICDSource(serviceID: $serviceID, environmentID: $environmentID)
    }`,
    { serviceID: service.id, environmentID },
  );
  if (cicd.errors?.length) {
    process.stdout.write(`cicdErr(${cicd.errors[0]?.message}) `);
  } else {
    process.stdout.write('cicdOK ');
  }

  const redeploy = await gql(
    token,
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) {
      redeployService(serviceID: $serviceID, environmentID: $environmentID)
    }`,
    { serviceID: service.id, environmentID },
  );
  if (redeploy.errors?.length) {
    console.log(`redeployErr ${JSON.stringify(redeploy.errors)}`);
  } else {
    console.log('redeployOK');
  }
}
