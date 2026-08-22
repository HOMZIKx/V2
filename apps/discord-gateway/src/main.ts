import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { resolveHttpListen } from '@v2/configuration';
import { createLogger, runBoundedShutdown } from '@v2/observability';
import { execSync } from 'node:child_process';
import path from 'node:path';

import { loadEnvFile } from './infrastructure/discord/load-env-file.js';
import { AppModule } from './interface/app.module.js';
import { loadDiscordConfig } from './interface/discord/discord-bootstrap.service.js';

loadEnvFile(path.resolve(process.cwd(), '.env'));
loadEnvFile(path.resolve(process.cwd(), 'apps/discord-gateway/.env'));

function resolveGitCommitSha(): string {
  // Prefer image-baked SHA (Zeabur build) over a stale manual GIT_COMMIT_SHA Variable.
  const baked =
    process.env.V2_IMAGE_GIT_COMMIT_SHA?.trim() || process.env.ZEABUR_GIT_COMMIT_SHA?.trim();
  if (baked && baked !== 'unknown') {
    return baked;
  }
  if (process.env.GIT_COMMIT_SHA && process.env.GIT_COMMIT_SHA !== 'unknown') {
    return process.env.GIT_COMMIT_SHA;
  }
  try {
    return execSync('git rev-parse HEAD', {
      cwd: path.resolve(process.cwd()),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function resolveGitBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: path.resolve(process.cwd()),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

process.env.GIT_COMMIT_SHA = resolveGitCommitSha();

const config = loadDiscordConfig();
const logger = createLogger('discord-gateway');

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 262_144 }),
  );

  const shutdown = async (signal: string): Promise<void> => {
    await runBoundedShutdown(logger, signal, async () => {
      await app.close();
    });
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  const listen = resolveHttpListen({
    defaultPort: config.DISCORD_GATEWAY_PORT,
    defaultHost: config.DISCORD_GATEWAY_HOST,
  });
  await app.listen(listen.port, listen.host);
  logger.info('Discord gateway HTTP listener started', {
    host: listen.host,
    port: listen.port,
    discordEnabled: config.DISCORD_ENABLED,
    gitCommitSha: process.env.GIT_COMMIT_SHA ?? 'unknown',
    gitBranch: resolveGitBranch(),
    buildMode: 'production-node-dist',
    panelRenderer: 'components-v2-container',
  });
};

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error('Discord gateway failed to bootstrap', { error: message });
  process.exitCode = 1;
});
