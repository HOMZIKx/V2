import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRepositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const serviceNamePattern = /^[a-z][a-z0-9-]*-service$/;
const dataOwningServicePattern =
  /^(identity|authorization|community|automation|notification|audit)-service$/;

function validateServiceName(name) {
  if (!serviceNamePattern.test(name)) {
    throw new Error('Service name must be kebab-case and end with "-service".');
  }
}

function renderFiles(name) {
  const scope = name.slice(0, -'-service'.length);
  const configPrefix = name.replaceAll('-', '_').toUpperCase();
  const port = 4400;
  const hasDatabaseUrl = dataOwningServicePattern.test(name);
  const databaseConfig = hasDatabaseUrl ? `,\n    DATABASE_URL: z.string().url().optional()` : '';

  return {
    'package.json': JSON.stringify(
      {
        name: `@v2/${name}`,
        version: '0.0.0',
        private: true,
        type: 'module',
        scripts: {
          dev: 'tsx src/main.ts',
          build: 'tsc -p tsconfig.json',
          start: `node dist/services/${name}/src/main.js`,
          test: 'vitest run --config vitest.config.ts',
          lint: 'eslint .',
          typecheck: 'tsc -p tsconfig.json --noEmit',
        },
        dependencies: {
          '@nestjs/common': '^11.1.28',
          '@nestjs/core': '^11.1.28',
          '@nestjs/platform-fastify': '^11.1.28',
          '@v2/configuration': 'workspace:*',
          '@v2/observability': 'workspace:*',
          fastify: '^5.5.0',
          'reflect-metadata': '^0.2.2',
          rxjs: '^7.8.2',
          tslib: '^2.8.1',
          zod: '^4.4.3',
        },
        devDependencies: {
          '@types/node': '^24.2.0',
          tsx: '^4.20.3',
          typescript: '~5.8.3',
          vitest: '^3.2.4',
        },
      },
      null,
      2,
    ).concat('\n'),
    'project.json': JSON.stringify(
      {
        name,
        $schema: '../../node_modules/nx/schemas/project-schema.json',
        sourceRoot: `services/${name}/src`,
        projectType: 'application',
        tags: ['type:service', `scope:${scope}`],
        targets: {
          serve: { command: `corepack pnpm --dir services/${name} dev` },
          build: { command: `corepack pnpm --dir services/${name} build` },
          lint: {
            command: `corepack pnpm exec eslint services/${name}/src --ignore-pattern "**/*.spec.ts"`,
          },
          typecheck: {
            command: `corepack pnpm exec tsc -p services/${name}/tsconfig.json --noEmit`,
          },
          test: {
            command: `corepack pnpm exec vitest run --config services/${name}/vitest.config.ts`,
          },
        },
      },
      null,
      2,
    ).concat('\n'),
    'tsconfig.json': `{
  "extends": "../../packages/typescript-config/nest.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "noEmit": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.spec.ts"]
}
`,
    'vitest.config.ts': `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['services/${name}/src/**/*.spec.ts'],
  },
});
`,
    'eslint.config.mjs': `import { createV2Config } from '@v2/eslint-config';

export default [{ ignores: ['eslint.config.mjs'] }, ...createV2Config()];
`,
    'README.md': `# ${name}

NestJS 11 and Fastify service scaffold with Domain, Application, Infrastructure, and Interface layers.

The default host is \`127.0.0.1\`. Set \`${configPrefix}_HOST=0.0.0.0\` only in a container or deployment that explicitly requires external binding.
`,
    'src/main.ts': `import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { createConfig } from '@v2/configuration';
import { createLogger } from '@v2/observability';
import { z } from 'zod';

import { serviceName } from './domain/service-name.js';
import { AppModule } from './interface/app.module.js';

const config = createConfig(
  z.object({
    ${configPrefix}_PORT: z.coerce.number().int().positive().default(${port}),
    ${configPrefix}_HOST: z.string().min(1).default('127.0.0.1')${databaseConfig},
  }),
);
const logger = createLogger(serviceName);

const bootstrap = async () => {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  logger.info('${name} started without a database connection.');
  await app.listen(config.${configPrefix}_PORT, config.${configPrefix}_HOST);
};

void bootstrap();
`,
    'src/domain/service-name.ts': `export const serviceName = '${name}' as const;\n`,
    'src/domain/service-name.spec.ts': `import { describe, expect, it } from 'vitest';

import { serviceName } from './service-name.js';

describe('serviceName', () => {
  it('identifies the bounded service', () => {
    expect(serviceName).toBe('${name}');
  });
});
`,
    'src/application/.gitkeep': '',
    'src/infrastructure/.gitkeep': '',
    'src/interface/app.module.ts': `import { Module } from '@nestjs/common';

import { HealthController } from './health.controller.js';

@Module({
  controllers: [HealthController],
})
export class AppModule {}
`,
    'src/interface/health.controller.ts': `import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get('live')
  live() {
    return { status: 'ok' as const };
  }

  @Get('ready')
  ready() {
    return { status: 'ok' as const };
  }
}
`,
    'src/interface/health.controller.spec.ts': `import { describe, expect, it } from 'vitest';

import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('reports liveness and readiness without a database connection', () => {
    const controller = new HealthController();

    expect(controller.live()).toEqual({ status: 'ok' });
    expect(controller.ready()).toEqual({ status: 'ok' });
  });
});
`,
  };
}

export function generateService({ name, root = defaultRepositoryRoot }) {
  validateServiceName(name);

  const serviceRoot = path.join(root, 'services', name);
  if (existsSync(serviceRoot)) {
    throw new Error(`Service "${name}" already exists; generator made no changes.`);
  }

  mkdirSync(path.dirname(serviceRoot), { recursive: true });
  mkdirSync(serviceRoot, { recursive: false });
  for (const [relativePath, contents] of Object.entries(renderFiles(name))) {
    const targetPath = path.join(serviceRoot, relativePath);
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, contents, { encoding: 'utf8', flag: 'wx' });
  }

  return serviceRoot;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const name = process.argv[2];

  try {
    if (name === undefined) {
      throw new Error('Usage: pnpm generate:service <kebab-case-name-service>');
    }

    generateService({ name });
    console.log(`Created service scaffold at services/${name}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
