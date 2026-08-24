#!/usr/bin/env node
/**
 * Sync Dockerfile content from git tip to Zeabur (OCI/upload services) and deploy.
 * Used locally and in GitHub Actions after push.
 *
 * Env:
 *   ZEABUR_TOKEN       — API token (required in CI; optional locally if ~/.config/zeabur/cli.yaml)
 *   ZEABUR_ENV_ID      — default 6a720a3e5f062718bc7b3421
 *   ZEABUR_SERVICES    — optional comma list to deploy subset
 *   ZEABUR_SKIP_DEPLOY — set "1" to only sync dockerfiles
 *   ZEABUR_WAIT_MS     — wait after deploys (default 0 in CI quick mode, 180000 local)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const environmentID = process.env.ZEABUR_ENV_ID?.trim() ?? '6a720a3e5f062718bc7b3421';
const registry = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'tools/runtime/service-registry.json'), 'utf8'),
);

/** Zeabur service IDs for project untitled-1 */
const SERVICE_IDS = {
  'authorization-service': '6a8211d5a21454a2cf6ad783',
  'identity-service': '6a8211cfbdeaa87e2cf6ad39',
  'activity-service': '6a8211c2a21454a2cf6ad77b',
  'discord-gateway': '6a8211a6bdeaa87e2c52df28',
  'api-gateway': '6a8211c9bdeaa87e2cf6ad34',
  web: '6a8211dba21454a2cf6ad789',
  admin: '6a8211e2a21454a2cf6ad78e',
};

/** Deploy order: backends → gateway → frontends → discord (24/7 last) */
const DEPLOY_ORDER = [
  'authorization-service',
  'identity-service',
  'activity-service',
  'api-gateway',
  'web',
  'admin',
  'discord-gateway',
];

function readToken() {
  const fromEnv = process.env.ZEABUR_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const yamlPath = path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml');
  if (!fs.existsSync(yamlPath)) {
    throw new Error('ZEABUR_TOKEN required (set env or run zeabur auth login)');
  }
  const yaml = fs.readFileSync(yamlPath, 'utf8');
  const match = yaml.match(/token:\s*(\S+)/);
  if (!match) throw new Error('No token in ~/.config/zeabur/cli.yaml');
  return match[1];
}

function tipSha() {
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

function runDeploy(serviceName, serviceID) {
  const proc = spawnSync(
    'npx',
    [
      'zeabur@latest',
      '-i=false',
      'deploy',
      '--service-id',
      serviceID,
      '--environment-id',
      environmentID,
      '--name',
      serviceName,
    ],
    { cwd: ROOT, encoding: 'utf8', shell: true, timeout: 600_000, env: process.env },
  );
  const out = `${proc.stdout}\n${proc.stderr}`;
  const ok =
    proc.status === 0 &&
    (/deployed successfully|Deployment started|Upload complete/i.test(out) || proc.status === 0);
  return { ok, status: proc.status, tail: out.slice(-500) };
}

async function syncDockerfile(token, serviceName, serviceID) {
  const entry = registry.services.find((s) => s.name === serviceName);
  if (!entry) throw new Error(`Unknown service ${serviceName}`);
  const dockerfilePath = path.join(ROOT, entry.dockerfile);
  const content = fs.readFileSync(dockerfilePath, 'utf8');
  const result = await gql(
    token,
    `mutation($serviceID: ObjectID!, $dockerfile: String!) {
      updateDockerfile(serviceID: $serviceID, dockerfile: $dockerfile)
    }`,
    { serviceID, dockerfile: content },
  );
  if (result.errors?.length) {
    return { ok: false, error: result.errors[0]?.message ?? 'updateDockerfile failed' };
  }
  return { ok: true, bytes: content.length };
}

async function latestDeploymentStatus(token, serviceID) {
  const result = await gql(
    token,
    `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
      deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 1) {
        edges { node { status commitSHA createdAt } }
      }
    }`,
    { serviceID, environmentID },
  );
  return result.data?.deployments?.edges?.[0]?.node ?? null;
}

async function smokePublic() {
  const checks = [
    ['api ready', 'https://v2-api.zeabur.app/health/ready'],
    ['discord bot', 'https://v22.zeabur.app/health/discord'],
    ['web', 'https://v2-web.zeabur.app/health'],
  ];
  for (const [label, url] of checks) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      const text = await res.text();
      console.log(`  ${label}: HTTP ${res.status} ${text.slice(0, 100)}`);
    } catch (error) {
      console.log(`  ${label}: FAIL ${error instanceof Error ? error.message : error}`);
    }
  }
}

async function main() {
  const token = readToken();
  const sha = tipSha();
  const only = process.env.ZEABUR_SERVICES?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const services = DEPLOY_ORDER.filter((name) => SERVICE_IDS[name]).filter(
    (name) => !only?.length || only.includes(name),
  );
  const skipDeploy = process.env.ZEABUR_SKIP_DEPLOY === '1';

  console.log(`Zeabur sync+deploy @ ${sha}`);
  console.log(`Environment ${environmentID}`);
  console.log(`Services: ${services.join(', ')}`);

  let failed = false;

  for (const name of services) {
    const id = SERVICE_IDS[name];
    process.stdout.write(`\n${name}: sync dockerfile... `);
    const sync = await syncDockerfile(token, name, id);
    if (!sync.ok) {
      console.log(`FAIL ${sync.error}`);
      failed = true;
      continue;
    }
    console.log(`OK (${sync.bytes} bytes)`);

    if (skipDeploy) continue;

    process.stdout.write(`${name}: deploy... `);
    const dep = runDeploy(name, id);
    if (dep.ok) {
      console.log('queued');
    } else {
      console.log(`FAIL exit=${dep.status}\n${dep.tail}`);
      failed = true;
    }
  }

  const waitMs = Number(process.env.ZEABUR_WAIT_MS ?? (process.env.CI ? '0' : '120000'));
  if (!skipDeploy && waitMs > 0) {
    console.log(`\nWaiting ${waitMs}ms for builds...`);
    await new Promise((r) => setTimeout(r, waitMs));
    console.log('\n=== latest deployment status ===');
    for (const name of services) {
      const node = await latestDeploymentStatus(token, SERVICE_IDS[name]);
      console.log(
        `${name}: ${node?.status ?? '?'} sha=${(node?.commitSHA ?? '').slice(0, 12) || 'upload'}`,
      );
    }
    console.log('\n=== public smoke ===');
    await smokePublic();
  }

  if (failed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
