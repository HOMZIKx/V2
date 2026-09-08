#!/usr/bin/env node
/**
 * Production entrypoint: apply pending SQL migrations (fail closed), then exec the service.
 * Set V2_SKIP_STARTUP_MIGRATE=1 only for emergency break-glass (not normal deploys).
 */
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const skip = process.env.V2_SKIP_STARTUP_MIGRATE?.trim() === '1';
const mainArgs = process.argv.slice(2);

if (mainArgs.length === 0) {
  console.error('usage: docker-entrypoint.mjs <main.js> [...args]');
  process.exit(1);
}

if (!skip) {
  const migrate = spawnSync(process.execPath, [path.join(scriptsDir, 'migrate-prod.mjs')], {
    stdio: 'inherit',
    env: process.env,
  });
  if (migrate.error !== undefined) {
    console.error('Startup migration failed to start:', migrate.error.message);
    process.exit(1);
  }
  if (migrate.status !== 0) {
    console.error('Startup migration failed; refusing to start service.');
    process.exit(migrate.status ?? 1);
  }
} else {
  console.warn('V2_SKIP_STARTUP_MIGRATE=1 — skipping startup migration (break-glass only).');
}

const child = spawn(process.execPath, mainArgs, {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error('Failed to start service process:', error.message);
  process.exit(1);
});
