import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const composeFile = path.join('infrastructure', 'docker', 'docker-compose.yml');
const command = process.argv[2];

const dockerCheck = spawnSync('docker', ['--version'], {
  cwd: repositoryRoot,
  stdio: 'ignore',
});

if (dockerCheck.error !== undefined || dockerCheck.status !== 0) {
  console.error(
    'Docker is required but was not found. Install and start Docker Desktop, then retry.',
  );
  process.exit(1);
}

const actions = {
  up: ['compose', '-f', composeFile, 'up', '-d'],
  down: ['compose', '-f', composeFile, 'down'],
  reset: ['compose', '-f', composeFile, 'down', '-v'],
  status: ['compose', '-f', composeFile, 'ps'],
};

if (command !== 'up' && command !== 'down' && command !== 'reset' && command !== 'status') {
  console.error('Usage: node tools/scripts/infra.mjs <up|down|reset|status>');
  process.exit(1);
}

if (command === 'reset') {
  console.warn('WARNING: reset permanently removes local infrastructure volumes.');
}

const result = spawnSync('docker', actions[command], {
  cwd: repositoryRoot,
  stdio: 'inherit',
});

if (result.error !== undefined) {
  console.error(`Unable to run Docker: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
