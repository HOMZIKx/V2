import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { isDependencyAllowed } from './boundaries.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']);
// Domain and application layers must not import any infrastructure engine.
// Matched against the import specifier (not raw file text) so legitimate string
// literals such as a `'discord'` provider id in a domain type are not flagged.
const forbiddenCoreImport =
  /^(?:@nestjs(?:\/|$)|nestjs(?:\/|$)|fastify(?:\/|$)|@fastify\/|typeorm(?:\/|$)|rabbitmq|ioredis(?:\/|$)|redis(?:\/|$)|discord|better-auth(?:\/|$)|@better-auth\/|pg(?:$|\/|-))/i;
const importPattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g;

function collectSourceFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === 'dist'
        ? []
        : collectSourceFiles(entryPath);
    }

    return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

function ownerFor(filePath: string): string | undefined {
  const relativePath = path.relative(repositoryRoot, filePath);
  const [topLevel, owner] = relativePath.split(path.sep);

  if ((topLevel === 'apps' || topLevel === 'services') && owner !== undefined) {
    return `${topLevel}/${owner}`;
  }

  return undefined;
}

function importsFrom(contents: string): string[] {
  return [...contents.matchAll(importPattern)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => specifier !== undefined);
}

describe('architecture boundaries', () => {
  const sourceFiles = [
    ...collectSourceFiles(path.join(repositoryRoot, 'apps')),
    ...collectSourceFiles(path.join(repositoryRoot, 'services')),
  ];

  it('prevents applications and services from importing each other', () => {
    const violations: string[] = [];

    for (const sourceFile of sourceFiles) {
      const owner = ownerFor(sourceFile);
      if (owner === undefined) {
        continue;
      }

      for (const specifier of importsFrom(readFileSync(sourceFile, 'utf8'))) {
        const target = specifier.startsWith('.')
          ? path.resolve(path.dirname(sourceFile), specifier)
          : path.resolve(repositoryRoot, specifier);
        const targetOwner = ownerFor(target);

        if (targetOwner !== undefined && targetOwner !== owner) {
          violations.push(`${path.relative(repositoryRoot, sourceFile)} -> ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps domain and application layers framework-free', () => {
    const violations = sourceFiles.flatMap((sourceFile) => {
      const normalizedPath = sourceFile.replaceAll('\\', '/');
      const isCoreLayer =
        normalizedPath.includes('/domain/') || normalizedPath.includes('/application/');

      if (!isCoreLayer) {
        return [];
      }

      return importsFrom(readFileSync(sourceFile, 'utf8'))
        .filter((specifier) => forbiddenCoreImport.test(specifier))
        .map((specifier) => `${path.relative(repositoryRoot, sourceFile)} -> ${specifier}`);
    });

    expect(violations).toEqual([]);
  });

  it('allows dependencies only through explicit type tags', () => {
    expect(isDependencyAllowed(['type:app'], ['type:util', 'scope:shared'])).toBe(true);
    expect(isDependencyAllowed(['type:app'], ['type:ui', 'scope:shared'])).toBe(true);
    expect(isDependencyAllowed(['type:service'], ['type:contracts', 'scope:shared'])).toBe(true);
    expect(isDependencyAllowed(['type:service'], ['type:config', 'scope:shared'])).toBe(true);
    expect(isDependencyAllowed(['type:service'], ['type:ui', 'scope:shared'])).toBe(false);
    expect(isDependencyAllowed(['type:service'], ['scope:shared'])).toBe(false);
  });

  it('keeps identity and authorization mutually isolated', () => {
    expect(
      isDependencyAllowed(['type:service', 'scope:identity'], ['type:util', 'scope:authorization']),
    ).toBe(false);
    expect(
      isDependencyAllowed(
        ['type:service', 'scope:authorization'],
        ['type:contracts', 'scope:identity'],
      ),
    ).toBe(false);
  });

  it('keeps activity isolated from identity and authorization packages', () => {
    expect(
      isDependencyAllowed(['type:service', 'scope:activity'], ['type:util', 'scope:identity']),
    ).toBe(false);
    expect(
      isDependencyAllowed(
        ['type:service', 'scope:activity'],
        ['type:contracts', 'scope:authorization'],
      ),
    ).toBe(false);
    expect(
      isDependencyAllowed(['type:service', 'scope:identity'], ['type:util', 'scope:activity']),
    ).toBe(false);
    expect(
      isDependencyAllowed(
        ['type:service', 'scope:authorization'],
        ['type:contracts', 'scope:activity'],
      ),
    ).toBe(false);
  });
});
