import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { generateService } from './generate-service.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('generateService', () => {
  it('creates a NestJS scaffold with explicit port and database ownership', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'v2-generator-smoke-'));
    temporaryRoots.push(root);

    const serviceRoot = generateService({
      name: 'community-service',
      port: 4401,
      dataOwnership: 'database',
      root,
    });
    const expectedFiles = [
      'package.json',
      'project.json',
      'tsconfig.json',
      'tsconfig.build.json',
      'vitest.config.ts',
      'eslint.config.mjs',
      'README.md',
      'src/main.ts',
      'src/domain/service-name.ts',
      'src/domain/service-name.spec.ts',
      'src/application/.gitkeep',
      'src/infrastructure/.gitkeep',
      'src/interface/app.module.ts',
      'src/interface/health.controller.ts',
      'src/interface/health.controller.spec.ts',
    ];

    for (const relativePath of expectedFiles) {
      expect(existsSync(path.join(serviceRoot, relativePath))).toBe(true);
    }

    const packageJson = JSON.parse(readFileSync(path.join(serviceRoot, 'package.json'), 'utf8'));
    expect(packageJson.dependencies['@nestjs/core']).toMatch(/^\^?11/);
    expect(packageJson.dependencies['@nestjs/platform-fastify']).toBeDefined();
    expect(packageJson.scripts.typecheck).toContain('tsconfig.json');
    expect(packageJson.scripts.build).toContain('tsconfig.build.json');

    const mainSource = readFileSync(path.join(serviceRoot, 'src/main.ts'), 'utf8');
    expect(mainSource).toContain('.default(4401)');
    expect(mainSource).toContain('DATABASE_URL: z.string().url().optional()');

    const vitestConfig = readFileSync(path.join(serviceRoot, 'vitest.config.ts'), 'utf8');
    expect(vitestConfig).toContain('createProjectTestConfig');
    expect(vitestConfig).toContain('coverageInclude');

    const projectJson = JSON.parse(readFileSync(path.join(serviceRoot, 'project.json'), 'utf8'));
    expect(projectJson.targets.lint.command).not.toContain('ignore-pattern');
    expect(projectJson.targets.typecheck.command).toContain('tsconfig.json');
    expect(projectJson.targets.typecheck.command).not.toContain('tsconfig.spec.json');
  });

  it('creates a second service with a different port and no database ownership', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'v2-generator-smoke-'));
    temporaryRoots.push(root);

    generateService({
      name: 'community-service',
      port: 4401,
      dataOwnership: 'database',
      root,
    });

    const secondRoot = generateService({
      name: 'notification-service',
      port: 4402,
      dataOwnership: 'none',
      root,
    });

    const secondMain = readFileSync(path.join(secondRoot, 'src/main.ts'), 'utf8');
    expect(secondMain).toContain('.default(4402)');
    expect(secondMain).not.toContain('DATABASE_URL');
  });

  it('rejects colliding ports and missing ownership', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'v2-generator-smoke-'));
    temporaryRoots.push(root);

    generateService({
      name: 'community-service',
      port: 4401,
      dataOwnership: 'database',
      root,
    });

    expect(() =>
      generateService({
        name: 'notification-service',
        port: 4401,
        dataOwnership: 'none',
        root,
      }),
    ).toThrow(/already used/);

    expect(() =>
      generateService({
        name: 'audit-service',
        port: 4403,
        dataOwnership: 'guess',
        root,
      }),
    ).toThrow(/Data ownership/);
  });

  it('refuses to overwrite an existing service', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'v2-generator-smoke-'));
    temporaryRoots.push(root);

    generateService({
      name: 'audit-service',
      port: 4404,
      dataOwnership: 'none',
      root,
    });

    expect(() =>
      generateService({
        name: 'audit-service',
        port: 4405,
        dataOwnership: 'none',
        root,
      }),
    ).toThrow('already exists');
  });
});
