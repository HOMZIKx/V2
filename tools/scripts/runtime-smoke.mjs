import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const corepack = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
const dummyDatabaseUrl = 'postgresql://smoke:smoke@127.0.0.1:5432/smoke';
const startupFailures = new WeakMap();

const applications = [
  {
    args: ['pnpm', '--dir', 'apps/web', 'start'],
    command: corepack,
    name: 'web',
    shell: true,
    url: 'http://127.0.0.1:3000/health',
  },
  {
    args: [
      'pnpm',
      '--dir',
      'apps/admin',
      'exec',
      'vite',
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      '3001',
    ],
    command: corepack,
    name: 'admin',
    shell: true,
    url: 'http://127.0.0.1:3001/',
  },
  {
    args: ['--import', 'tsx', 'apps/api-gateway/dist/apps/api-gateway/src/main.js'],
    command: process.execPath,
    name: 'api-gateway',
    url: 'http://127.0.0.1:4000/health/live',
  },
  {
    args: ['--import', 'tsx', 'apps/discord-gateway/dist/apps/discord-gateway/src/main.js'],
    command: process.execPath,
    name: 'discord-gateway',
    url: 'http://127.0.0.1:4100/health/live',
  },
  {
    args: [
      '--import',
      'tsx',
      'services/identity-service/dist/services/identity-service/src/main.js',
    ],
    command: process.execPath,
    name: 'identity-service',
    url: 'http://127.0.0.1:4200/health/live',
  },
  {
    args: [
      '--import',
      'tsx',
      'services/authorization-service/dist/services/authorization-service/src/main.js',
    ],
    command: process.execPath,
    name: 'authorization-service',
    url: 'http://127.0.0.1:4300/health/live',
  },
];

function startApplication(application) {
  const child = spawn(application.command, application.args, {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      ADMIN_PORT: '3001',
      API_GATEWAY_HOST: '127.0.0.1',
      API_GATEWAY_PORT: '4000',
      AUTHORIZATION_DATABASE_URL: dummyDatabaseUrl,
      AUTHORIZATION_SERVICE_HOST: '127.0.0.1',
      AUTHORIZATION_SERVICE_PORT: '4300',
      DISCORD_GATEWAY_HOST: '127.0.0.1',
      DISCORD_GATEWAY_PORT: '4100',
      IDENTITY_DATABASE_URL: dummyDatabaseUrl,
      IDENTITY_SERVICE_HOST: '127.0.0.1',
      IDENTITY_SERVICE_PORT: '4200',
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    shell: application.shell ?? false,
    stdio: 'pipe',
  });

  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  child.once('error', (error) => {
    startupFailures.set(child, error);
  });
  child.once('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      startupFailures.set(
        child,
        new Error(
          `${application.name} exited before becoming healthy (code ${code}, signal ${signal}).`,
        ),
      );
    }
  });
  return child;
}

async function waitForHealthy(application, child) {
  const timeoutAt = Date.now() + 90_000;
  let lastError = 'no response';

  while (Date.now() < timeoutAt) {
    const startupFailure = startupFailures.get(child);
    if (startupFailure !== undefined) {
      throw startupFailure;
    }

    try {
      const response = await fetch(application.url, { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`${application.name} did not become healthy at ${application.url}: ${lastError}`);
}

function stopApplication(child) {
  if (child.pid === undefined || child.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    return;
  }

  child.kill('SIGTERM');
}

function freePort(port) {
  try {
    if (process.platform === 'win32') {
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
        ],
        { stdio: 'ignore', timeout: 5000 },
      );
      return;
    }

    execFileSync(
      'bash',
      ['-lc', `if command -v fuser >/dev/null 2>&1; then fuser -k ${port}/tcp >/dev/null 2>&1 || true; fi`],
      { stdio: 'ignore', timeout: 5000 },
    );
  } catch {
    // Port may already be free.
  }
}

for (const port of [3000, 3001, 4000, 4100, 4200, 4300]) {
  freePort(port);
}

const requiredArtifacts = [
  'apps/web/.next/BUILD_ID',
  'apps/admin/dist/index.html',
  'apps/api-gateway/dist/apps/api-gateway/src/main.js',
  'apps/discord-gateway/dist/apps/discord-gateway/src/main.js',
  'services/identity-service/dist/services/identity-service/src/main.js',
  'services/authorization-service/dist/services/authorization-service/src/main.js',
];

for (const relativePath of requiredArtifacts) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(
      `Missing build artifact "${relativePath}". Run "pnpm build" before runtime smoke.`,
    );
  }
}

const children = [];

try {
  for (const application of applications) {
    const child = startApplication(application);
    children.push(child);
    await waitForHealthy(application, child);
  }
  console.log('Runtime smoke checks passed for all six applications and services.');
} finally {
  for (const child of children) {
    try {
      stopApplication(child);
    } catch {
      // The process may have already exited after a failed startup.
    }
  }
}
