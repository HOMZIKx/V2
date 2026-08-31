#!/usr/bin/env node
/**
 * Bind HOMZIKx/V2 git branch and redeploy all P4 app services on Zeabur.
 * Reads token from ~/.config/zeabur/cli.yaml (Zeabur CLI login).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const repoID = 1323125581;
const branchName = process.env.ZEABUR_BRANCH?.trim() ?? 'cursor/p4-1-activity-domain';
const gitURL = 'https://github.com/HOMZIKx/V2';
const waitMs = Number(process.env.ZEABUR_WAIT_MS ?? '420000');

const services = [
  { name: 'authorization-service', id: '6a8211d5a21454a2cf6ad783' },
  { name: 'identity-service', id: '6a8211cfbdeaa87e2c52df39' },
  { name: 'activity-service', id: '6a8211c2a21454a2cf6ad77b' },
  { name: 'discord-gateway', id: '6a8211a6bdeaa87e2c52df28' },
  { name: 'api-gateway', id: '6a8211c9bdeaa87e2c52df34' },
  { name: 'web', id: '6a8211dba21454a2cf6ad789' },
  { name: 'admin', id: '6a8211e2a21454a2cf6ad78e' },
];

function readToken() {
  const fromEnv = process.env.ZEABUR_TOKEN?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
  const match = yaml.match(/token:\s*(\S+)/);
  if (!match) {
    throw new Error('No ZEABUR_TOKEN and no ~/.config/zeabur/cli.yaml token');
  }
  return match[1];
}

function tipSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
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

async function main() {
  const token = readToken();
  const expectedSha = tipSha();
  console.log(`Branch ${branchName} @ ${expectedSha}`);
  console.log(`Environment ${environmentID}`);

  for (const service of services) {
    process.stdout.write(`\n${service.name}: `);
    const bind = await gql(
      token,
      `mutation Bind($serviceID: ObjectID!, $gitURL: String!, $branch: String!) {
        bindServiceGitRepo(serviceID: $serviceID, gitURL: $gitURL, branch: $branch)
      }`,
      { serviceID: service.id, gitURL, branch: branchName },
    );
    if (bind.errors?.length) {
      console.log('bind warn', bind.errors.map((e) => e.message).join('; '));
    } else {
      process.stdout.write('bind OK ');
    }

    const trig = await gql(
      token,
      `mutation Trigger($serviceID: ObjectID!, $environmentID: ObjectID!, $trigger: TriggerInput!) {
        updateGitTrigger(serviceID: $serviceID, environmentID: $environmentID, trigger: $trigger)
      }`,
      { serviceID: service.id, environmentID, trigger: { repoID, branchName } },
    );
    if (trig.errors?.length) {
      console.log('trigger FAIL', JSON.stringify(trig.errors));
      continue;
    }
    process.stdout.write('trigger OK deploy... ');

    const dockerfile = `Dockerfile.${service.name}`;
    const dep = await gql(
      token,
      `mutation Deploy($serviceID: ObjectID!, $specification: DeploymentSpecification!) {
        deployFromSpecification(serviceID: $serviceID, specification: $specification) {
          deploymentID
        }
      }`,
      {
        serviceID: service.id,
        specification: {
          preserveExistingEnv: true,
          source: {
            source: 'GITHUB',
            repoID,
            branch: branchName,
            dockerfile,
          },
        },
      },
    );
    if (dep.errors?.length) {
      console.log('deploy FAIL', JSON.stringify(dep.errors));
      continue;
    }
    console.log(`deploy queued id=${dep.data?.deployFromSpecification?.deploymentID ?? 'ok'}`);
  }

  console.log(`\nWaiting ${waitMs}ms for builds...`);
  await new Promise((resolve) => setTimeout(resolve, waitMs));

  console.log('\n=== deployment status ===');
  for (const service of services) {
    const result = await gql(
      token,
      `query Status($serviceID: ObjectID!, $environmentID: ObjectID!) {
        deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 1) {
          edges { node { status commitSHA createdAt } }
        }
      }`,
      { serviceID: service.id, environmentID },
    );
    const node = result.data?.deployments?.edges?.[0]?.node;
    const sha = node?.commitSHA ?? 'unknown';
    const match =
      sha !== 'unknown' && sha.startsWith(expectedSha.slice(0, 7)) ? 'MATCH' : 'MISMATCH';
    console.log(`${service.name}: ${node?.status ?? '?'} sha=${sha.slice(0, 12)} ${match}`);
  }

  console.log('\nSmoke (public):');
  for (const [label, url] of [
    ['api live', 'https://v2-api.zeabur.app/health/live'],
    ['discord live', 'https://v22.zeabur.app/health/live'],
    ['discord bot', 'https://v22.zeabur.app/health/discord'],
  ]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      const text = await res.text();
      console.log(`${label}: HTTP ${res.status} ${text.slice(0, 120)}`);
    } catch (error) {
      console.log(`${label}: FAIL ${error instanceof Error ? error.message : error}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
