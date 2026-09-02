import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const result = spawnSync('corepack', ['pnpm', 'exec', 'next', ...args], {
  cwd: appRoot,
  env: {
    ...process.env,
    NODE_ENV: args[0] === 'dev' ? 'development' : 'production',
  },
  shell: true,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
