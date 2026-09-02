#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';

const SERVICE_IDS = {
  'activity-service': '6a8211c2a21454a2cf6ad77b',
  'discord-gateway': '6a8211a6bdeaa87e2c52df28',
  'api-gateway': '6a8211c9bdeaa87e2c52df34',
  'identity-service': '6a8211cfbdeaa87e2c52df39',
  web: '6a8211dba21454a2cf6ad789',
};

function readToken() {
  const fromEnv = process.env.ZEABUR_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
  const match = yaml.match(/token:\s*(\S+)/);
  if (!match) throw new Error('No Zeabur token');
  return match[1];
}

function tipSha() {
  if (process.argv[2]?.trim()) return process.argv[2].trim();
  return spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
}

async function gql(token, query, variables = {}) {
  const response = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

async function setGitSha(token, serviceID, sha) {
  const create = await gql(
    token,
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!, $key: String!, $value: String!) {
      createEnvironmentVariable(serviceID: $serviceID, environmentID: $environmentID, key: $key, value: $value) {
        key
        value
      }
    }`,
    { serviceID, environmentID, key: 'GIT_COMMIT_SHA', value: sha },
  );
  if (!create.errors?.length) {
    return { ok: true, mode: 'create' };
  }
  const createErr = create.errors[0]?.message ?? '';
  const update = await gql(
    token,
    `mutation($serviceID: ObjectID!, $environmentID: ObjectID!, $oldKey: String!, $newKey: String!, $value: String!) {
      updateSingleEnvironmentVariable(
        serviceID: $serviceID
        environmentID: $environmentID
        oldKey: $oldKey
        newKey: $newKey
        value: $value
      ) {
        key
        value
      }
    }`,
    {
      serviceID,
      environmentID,
      oldKey: 'GIT_COMMIT_SHA',
      newKey: 'GIT_COMMIT_SHA',
      value: sha,
    },
  );
  if (!update.errors?.length) {
    return { ok: true, mode: 'update' };
  }
  return {
    ok: false,
    error: `create=${createErr}; update=${update.errors[0]?.message ?? 'unknown'}`,
  };
}

async function main() {
  const token = readToken();
  const sha = tipSha();
  const only = process.env.ZEABUR_SERVICES?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const services = Object.keys(SERVICE_IDS).filter((name) => !only?.length || only.includes(name));
  console.log(`GIT_COMMIT_SHA=${sha}`);
  for (const name of services) {
    const result = await setGitSha(token, SERVICE_IDS[name], sha);
    console.log(result.ok ? `${name}: OK (${result.mode})` : `${name}: FAIL ${result.error}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
