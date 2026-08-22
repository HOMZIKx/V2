#!/usr/bin/env node
/**
 * Redeploy V2 app services on Zeabur to the current git tip.
 *
 * Requires:
 *   ZEABUR_TOKEN          — API token (Zeabur → Settings → API Tokens)
 *   ZEABUR_ENV_ID         — environment id (optional if discoverable)
 *   ZEABUR_PROJECT_NAME   — optional project name filter (default: first match with v2 services)
 *
 * Usage:
 *   ZEABUR_TOKEN=... node ./tools/scripts/zeabur-redeploy.mjs
 *   ZEABUR_TOKEN=... node ./tools/scripts/zeabur-redeploy.mjs --dry-run
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const APP_SERVICES = [
  'activity-service',
  'identity-service',
  'authorization-service',
  'api-gateway',
  'discord-gateway',
  'web',
  'admin',
];

const dryRun = process.argv.includes('--dry-run');

function tipSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
}

function tipBranch() {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

function zeabur(args, { allowFail = false } = {}) {
  const token = process.env.ZEABUR_TOKEN?.trim();
  if (!token) {
    throw new Error('ZEABUR_TOKEN is required');
  }
  const full = ['--yes', 'zeabur@latest', '-i=false', '--json', ...args];
  try {
    const out = execFileSync('npx', full, {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        ZEABUR_TOKEN: token,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    });
    return out.trim();
  } catch (error) {
    if (allowFail) {
      const err = error;
      const stderr = typeof err.stderr === 'string' ? err.stderr : '';
      const stdout = typeof err.stdout === 'string' ? err.stdout : '';
      return stdout || stderr || String(error);
    }
    throw error;
  }
}

function login() {
  const token = process.env.ZEABUR_TOKEN?.trim();
  if (!token) {
    throw new Error('Set ZEABUR_TOKEN (Zeabur → Settings → API Tokens)');
  }
  execFileSync('npx', ['--yes', 'zeabur@latest', '-i=false', 'auth', 'login', '--token', token], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
  });
}

function main() {
  const sha = tipSha();
  const branch = tipBranch();
  const envId = process.env.ZEABUR_ENV_ID?.trim();
  console.log(`Tip: ${branch} @ ${sha}`);
  console.log(dryRun ? 'Mode: dry-run' : 'Mode: live redeploy');

  login();

  if (!envId) {
    console.error(
      'ZEABUR_ENV_ID is required for non-interactive redeploy. Copy it from Zeabur project → Environment.',
    );
    console.error(
      'Then: ZEABUR_TOKEN=... ZEABUR_ENV_ID=... node ./tools/scripts/zeabur-redeploy.mjs',
    );
    process.exitCode = 2;
    return;
  }

  for (const name of APP_SERVICES) {
    console.log(`\n=== ${name} ===`);
    if (dryRun) {
      console.log(`would update GIT_COMMIT_SHA=${sha}`);
      console.log(`would set APP_VERSION=0.1.0-zeabur (if missing)`);
      console.log(`would redeploy --name ${name} --env-id ${envId}`);
      continue;
    }

    try {
      const updateOut = zeabur(
        [
          'variable',
          'update',
          '-n',
          name,
          '--env-id',
          envId,
          '-k',
          `GIT_COMMIT_SHA=${sha}`,
          '-k',
          'APP_VERSION=0.1.0-zeabur',
          '-y',
        ],
        { allowFail: true },
      );
      console.log('variable update:', updateOut.slice(0, 400) || '(ok)');
    } catch (error) {
      console.error(`variable update failed for ${name}:`, error);
    }

    try {
      const redeployOut = zeabur(['service', 'redeploy', '-n', name, '--env-id', envId, '-y'], {
        allowFail: true,
      });
      console.log('redeploy:', redeployOut.slice(0, 400) || '(ok)');
    } catch (error) {
      console.error(`redeploy failed for ${name}:`, error);
      process.exitCode = 1;
    }
  }

  console.log('\nDone. Verify:');
  console.log('  curl -s https://v2-api.zeabur.app/health/live');
  console.log('  Discord /status → Commit should be', sha.slice(0, 7));
  console.log('  Expected tip:', sha);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
