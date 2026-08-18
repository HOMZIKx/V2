import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const isWindows = process.platform === 'win32';
const packageManager = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

const mode = process.argv.includes('--quick') ? 'quick' : 'full';

const quickChecks = [
  [packageManager, ['pnpm', 'format:check']],
  [packageManager, ['pnpm', 'lint']],
  [packageManager, ['pnpm', 'typecheck']],
  [packageManager, ['pnpm', 'test']],
  [packageManager, ['pnpm', 'architecture:check']],
  [packageManager, ['pnpm', 'runtime:doctor']],
  [packageManager, ['pnpm', 'build']],
  ['docker', ['compose', '-f', 'infrastructure/docker/docker-compose.yml', 'config']],
];

const fullChecks = [
  [packageManager, ['pnpm', 'format:check']],
  [packageManager, ['pnpm', 'lint']],
  [packageManager, ['pnpm', 'typecheck']],
  [packageManager, ['pnpm', 'test:coverage']],
  [packageManager, ['pnpm', 'architecture:check']],
  [packageManager, ['pnpm', 'runtime:doctor']],
  [packageManager, ['pnpm', 'build']],
  [packageManager, ['pnpm', 'test:e2e']],
  [packageManager, ['pnpm', '--dir', 'apps/web', 'build']],
  [packageManager, ['pnpm', '--dir', 'apps/admin', 'build']],
  [
    packageManager,
    ['pnpm', 'test:runtime-smoke'],
    { NODE_ENV: 'production', CI: process.env.CI ?? 'true' },
  ],
  ['docker', ['compose', '-f', 'infrastructure/docker/docker-compose.yml', 'config']],
];

if (process.env.RUN_INFRA_TESTS === 'true') {
  fullChecks.push([packageManager, ['pnpm', 'test:infra']]);
}

const checks = mode === 'quick' ? quickChecks : fullChecks;

function run(executable, args, extraEnv = {}) {
  const displayCommand = `${executable} ${args.join(' ')}`;
  console.log(`\n> ${displayCommand}`);

  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    stdio: 'inherit',
    shell: isWindows,
    env: {
      ...process.env,
      ...extraEnv,
    },
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

for (const check of checks) {
  const [executable, args, extraEnv] = check;
  run(executable, args, extraEnv ?? {});
}

console.log(`\nAll ${mode} validation checks passed.`);
