#!/usr/bin/env node
/**
 * Ensure web service has NEXT_PUBLIC_ACTIVITY_ORGANIZATION_ID aligned with discord-gateway.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const discordGatewayID = '6a8211a6bdeaa87e2c52df28';
const webServiceID = '6a8211dba21454a2cf6ad789';
const orgVar = 'NEXT_PUBLIC_ACTIVITY_ORGANIZATION_ID';

function readToken() {
  const fromEnv = process.env.ZEABUR_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
  return yaml.match(/token:\s*(\S+)/)?.[1];
}

function listVars(serviceID) {
  const listed = spawnSync(
    'npx',
    [
      'zeabur@latest',
      '-i=false',
      'variable',
      'list',
      '--id',
      serviceID,
      '--env-id',
      environmentID,
      '--json',
    ],
    { encoding: 'utf8', shell: true },
  );
  const stdout = listed.stdout ?? '';
  const jsonStart = stdout.indexOf('{');
  if (jsonStart < 0) {
    throw new Error(`variable list failed: ${listed.stderr ?? 'no output'}`);
  }
  const parsed = JSON.parse(listed.stdout.slice(jsonStart));
  const map = new Map();
  for (const row of [...(parsed.variables ?? []), ...(parsed.readonlyVariables ?? [])]) {
    map.set(row.key, row.value ?? '');
  }
  return map;
}

async function gql(token, query, variables = {}) {
  const response = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

async function setVar(token, serviceID, key, value) {
  const update = await gql(
    token,
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!, $oldKey: String!, $newKey: String!, $value: String!) {
      updateSingleEnvironmentVariable(serviceID: $serviceID, environmentID: $environmentID, oldKey: $oldKey, newKey: $newKey, value: $value) { key }
    }`,
    { serviceID, environmentID, oldKey: key, newKey: key, value },
  );
  if (update.errors?.length) {
    const create = await gql(
      token,
      `mutation($serviceID: ObjectID!, $environmentID: ObjectID!, $key: String!, $value: String!) {
        createEnvironmentVariable(serviceID: $serviceID, environmentID: $environmentID, key: $key, value: $value) { key }
      }`,
      { serviceID, environmentID, key, value },
    );
    if (create.errors?.length) throw new Error(`${key}: update/create failed`);
  }
  console.log(`${serviceID.slice(-6)} ${key}: OK`);
}

const token = readToken();
if (!token) {
  console.error('No Zeabur token');
  process.exit(1);
}

const dgVars = listVars(discordGatewayID);
const orgId =
  dgVars.get('ACTIVITY_ORGANIZATION_ID')?.trim() ??
  process.env.ACTIVITY_ORGANIZATION_ID?.trim() ??
  'org-v2-zeabur-p4';

const webVars = listVars(webServiceID);
if (webVars.get(orgVar) !== orgId) {
  await setVar(token, webServiceID, orgVar, orgId);
} else {
  console.log(`web ${orgVar} already set`);
}

const restart = await gql(
  token,
  `mutation($serviceID: ObjectID!, $environmentID: ObjectID!) { restartService(serviceID: $serviceID, environmentID: $environmentID) }`,
  { serviceID: webServiceID, environmentID },
);
console.log('restart web:', restart.data?.restartService === true ? 'ok' : 'fail');
