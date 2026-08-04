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
  it('creates an identity-style NestJS and Fastify service scaffold', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'v2-generator-smoke-'));
    temporaryRoots.push(root);

    const serviceRoot = generateService({ name: 'community-service', root });
    const expectedFiles = [
      'package.json',
      'project.json',
      'tsconfig.json',
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
    expect(packageJson.dependencies.zod).toBeDefined();
    expect(packageJson.scripts).toMatchObject({
      build: expect.any(String),
      dev: expect.any(String),
      lint: expect.any(String),
      start: expect.any(String),
      test: expect.any(String),
      typecheck: expect.any(String),
    });

    const healthController = readFileSync(
      path.join(serviceRoot, 'src/interface/health.controller.ts'),
      'utf8',
    );
    expect(healthController).toContain("@Get('live')");
    expect(healthController).toContain("@Get('ready')");
    expect(readFileSync(path.join(serviceRoot, 'src/main.ts'), 'utf8')).toContain(
      'DATABASE_URL: z.string().url().optional()',
    );
  });

  it('refuses to overwrite an existing service', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'v2-generator-smoke-'));
    temporaryRoots.push(root);

    generateService({ name: 'audit-service', root });

    expect(() => generateService({ name: 'audit-service', root })).toThrow('already exists');
  });
});
