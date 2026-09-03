import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const corepack = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
const dummyDatabaseUrl = 'postgresql://smoke:smoke@127.0.0.1:5432/smoke';
const startupFailures = new WeakMap();

function allocatePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate an ephemeral port.'));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', (error) => {
      reject(
        new Error(
          `Port ${port} is already in use (${error.code ?? 'EADDRINUSE'}). ` +
            'Free the port manually or stop the conflicting process, then re-run runtime smoke.',
        ),
      );
    });
    server.listen(port, '127.0.0.1', () => {
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve();
      });
    });
  });
}

function startApplication(application) {
  const child = spawn(application.command, application.args, {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      ...application.env,
      AUTHORIZATION_DATABASE_URL: dummyDatabaseUrl,
      IDENTITY_DATABASE_URL: dummyDatabaseUrl,
      AUTHORIZATION_ENABLED: 'false',
      IDENTITY_AUTH_ENABLED: 'false',
      IDENTITY_AUTHORIZATION_ENABLED: 'false',
      DISCORD_AUTHORIZATION_SYNC_ENABLED: 'false',
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    shell: application.shell ?? false,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  });

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
  const timeoutAt = Date.now() + 60_000;
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

  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

const requiredArtifacts = [
  'apps/web/.next/BUILD_ID',
  'apps/admin/dist/index.html',
  'apps/api-gateway/dist/apps/api-gateway/src/main.js',
  'apps/discord-gateway/dist/apps/discord-gateway/src/main.js',
  'services/identity-service/dist/services/identity-service/src/main.js',
  'services/authorization-service/dist/services/authorization-service/src/main.js',
  'services/player-team-service/dist/services/player-team-service/src/main.js',
];

for (const relativePath of requiredArtifacts) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(
      `Missing build artifact "${relativePath}". Run "pnpm build" before runtime smoke.`,
    );
  }
}

const [webPort, adminPort, apiGatewayPort, discordGatewayPort, identityPort, authorizationPort, playerTeamPort] =
  await Promise.all([
    allocatePort(),
    allocatePort(),
    allocatePort(),
    allocatePort(),
    allocatePort(),
    allocatePort(),
    allocatePort(),
  ]);

for (const port of [
  webPort,
  adminPort,
  apiGatewayPort,
  discordGatewayPort,
  identityPort,
  authorizationPort,
  playerTeamPort,
]) {
  await assertPortAvailable(port);
}

const applications = [
  {
    args: [
      'pnpm',
      '--dir',
      'apps/web',
      'exec',
      'node',
      './run-next.mjs',
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(webPort),
    ],
    command: corepack,
    env: {
      PORT: String(webPort),
      HOSTNAME: '127.0.0.1',
    },
    name: 'web',
    shell: true,
    url: `http://127.0.0.1:${webPort}/health`,
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
      String(adminPort),
    ],
    command: corepack,
    env: {
      ADMIN_PORT: String(adminPort),
    },
    name: 'admin',
    shell: true,
    url: `http://127.0.0.1:${adminPort}/`,
  },
  {
    args: ['--import', 'tsx', 'apps/api-gateway/dist/apps/api-gateway/src/main.js'],
    command: process.execPath,
    env: {
      API_GATEWAY_HOST: '127.0.0.1',
      API_GATEWAY_PORT: String(apiGatewayPort),
    },
    name: 'api-gateway',
    url: `http://127.0.0.1:${apiGatewayPort}/health/live`,
  },
  {
    args: ['--import', 'tsx', 'apps/discord-gateway/dist/apps/discord-gateway/src/main.js'],
    command: process.execPath,
    env: {
      DISCORD_GATEWAY_HOST: '127.0.0.1',
      DISCORD_GATEWAY_PORT: String(discordGatewayPort),
    },
    name: 'discord-gateway',
    url: `http://127.0.0.1:${discordGatewayPort}/health/live`,
  },
  {
    args: [
      '--import',
      'tsx',
      'services/identity-service/dist/services/identity-service/src/main.js',
    ],
    command: process.execPath,
    env: {
      IDENTITY_SERVICE_HOST: '127.0.0.1',
      IDENTITY_SERVICE_PORT: String(identityPort),
    },
    name: 'identity-service',
    url: `http://127.0.0.1:${identityPort}/health/live`,
  },
  {
    args: [
      '--import',
      'tsx',
      'services/authorization-service/dist/services/authorization-service/src/main.js',
    ],
    command: process.execPath,
    env: {
      AUTHORIZATION_SERVICE_HOST: '127.0.0.1',
      AUTHORIZATION_SERVICE_PORT: String(authorizationPort),
    },
    name: 'authorization-service',
    url: `http://127.0.0.1:${authorizationPort}/health/live`,
  },
  {
    args: [
      '--import',
      'tsx',
      'services/player-team-service/dist/services/player-team-service/src/main.js',
    ],
    command: process.execPath,
    env: {
      PLAYER_TEAM_SERVICE_HOST: '127.0.0.1',
      PLAYER_TEAM_SERVICE_PORT: String(playerTeamPort),
      PLAYER_TEAM_DATABASE_URL:
        process.env.PLAYER_TEAM_DATABASE_URL ??
        'postgresql://player_team:player_team_dev_password@127.0.0.1:5432/player_team',
      PLAYER_TEAM_ALLOW_DEMO_WRITE: 'true',
    },
    name: 'player-team-service',
    url: `http://127.0.0.1:${playerTeamPort}/health/live`,
  },
];

const children = [];

try {
  for (const application of applications) {
    const child = startApplication(application);
    children.push(child);
    await waitForHealthy(application, child);
  }
  console.log('Runtime smoke checks passed for all seven applications and services.');
} finally {
  for (const child of children) {
    try {
      stopApplication(child);
    } catch {
      // The process may have already exited after a failed startup.
    }
  }
}
