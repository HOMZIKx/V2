import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const isWindows = process.platform === 'win32';
const packageManager = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

const checks = [
  [packageManager, ['pnpm', 'format:check']],
  [packageManager, ['pnpm', 'lint']],
  [packageManager, ['pnpm', 'typecheck']],
  [packageManager, ['pnpm', 'test']],
  [packageManager, ['pnpm', 'architecture:check']],
  [packageManager, ['pnpm', 'build']],
  ['docker', ['compose', '-f', 'infrastructure/docker/docker-compose.yml', 'config']],
];

function run(executable, args) {
  const displayCommand = `${executable} ${args.join(' ')}`;
  console.log(`\n> ${displayCommand}`);

  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    stdio: 'inherit',
    shell: isWindows,
    env: process.env,
  });

  if (result.error !== undefined) {
    console.error(`Could not run ${displayCommand}: ${result.error.message}`);
    if (executable === 'docker') {
      console.error(
        'Docker CLI is required for compose validation. Install Docker Desktop and ensure `docker` is on PATH.',
      );
    }
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

for (const [executable, args] of checks) {
  run(executable, args);
}

console.log('\nAll validation checks passed.');
